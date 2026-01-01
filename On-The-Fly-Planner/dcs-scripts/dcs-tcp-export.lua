-- dcs-tcp-export.lua
-- NON-BLOCKING TCP CLIENT & COMMAND LISTENER
-- This script prevents game stutters by using asynchronous socket calls.

package.path  = package.path..";"..lfs.currentdir().."/LuaSocket/?.lua"
package.cpath = package.cpath..";"..lfs.currentdir().."/LuaSocket/?.dll"

local socket = require("socket")
local JSON = loadfile("Scripts/JSON.lua")()

-- SETTINGS
local host = "127.0.0.1"
local port = 3001
local cmdPort = 10102 -- NEW: Port for your Node.js "Puncher" to talk to
local updateInterval = 0.5 

-- STATE MACHINE
local STATE_DISCONNECTED = 0
local STATE_CONNECTING   = 1
local STATE_CONNECTED    = 2

local currentState = STATE_DISCONNECTED
local tcpClient = nil
local cmdServer = nil -- NEW: The "Ear" socket
local lastActionTime = 0

-- Helper: Rounding
local function round(num, decimals)
    local mult = 10^(decimals or 0)
    return math.floor(num * mult + 0.5) / mult
end

-- [getPayloadData FUNCTION]
local function getPayloadData()
    local status, result = pcall(function()
        local info = LoGetPayloadInfo()
        if not info then return nil end
        local stations = {}
        if info.Stations then
            for i, st in pairs(info.Stations) do
                if st and st.count and st.count > 0 then
                    local wName = "Store"
                    if st.weapon then 
                        wName = LoGetNameByType(st.weapon.level1, st.weapon.level2, st.weapon.level3, st.weapon.level4) or "Unknown"
                    end
                    table.insert(stations, { id = i, name = wName, count = st.count, clsid = st.CLSID, weapon = st.weapon })
                end
            end
        end
        return stations
    end)
    if status then return result else return nil end
end

-- [getWeatherData FUNCTION]
local function getWeatherData(myPos)
    local status, result = pcall(function()
        if not myPos then return nil end
        local weather = LoGetWeatherAtPoint(myPos.x, myPos.y, myPos.z)
        if not weather then return nil end
        local windSpeed = math.sqrt(weather.wind.x^2 + weather.wind.z^2) * 1.94384
        local windDirRad = math.atan2(weather.wind.z, weather.wind.x)
        local windDirDeg = math.deg(windDirRad)
        windDirDeg = (windDirDeg + 180) % 360
        if windDirDeg < 0 then windDirDeg = windDirDeg + 360 end
        return {
            windSpd = round(windSpeed, 1),
            windDir = round(windDirDeg, 0),
            temp = round(weather.temperature, 1),
            pres = round(weather.pressure * 0.02953, 2)
        }
    end)
    if status then return result else return nil end
end

-- [getMechInfo FUNCTION]
local function getMechInfo()
    local status, result = pcall(function()
        local data = {}
        local snares = LoGetSnares() 
        if snares then
            data.chaff = snares.chaff
            data.flare = snares.flare
        end
        local engine = LoGetEngineInfo()
        if engine then
            data.fuelInt = round(engine.fuel_internal * 2.20462, 0)
            data.fuelExt = round(engine.fuel_external * 2.20462, 0)
        end
        local payload = LoGetPayloadInfo()
        if payload and payload.Cannon then
             data.gun = payload.Cannon.shells_count
        end
        return data
    end)
    if status then return result else return nil end
end

-- [safeGetData FUNCTION]
local function safeGetData()
    local mySelf = LoGetSelfData()
    if not mySelf then return nil end

    local lat = round(mySelf.LatLongAlt.Lat, 6)
    local lon = round(mySelf.LatLongAlt.Long, 6)
    local alt = math.floor(mySelf.LatLongAlt.Alt * 3.28084)
    local hdg = round(mySelf.Heading, 4)
    
    local uName = mySelf.UnitName or "Unknown"
    local gName = mySelf.GroupName or "Unknown"

    local myPayload = getPayloadData()
    local myWeather = getWeatherData(mySelf.Position)
    local myMech = getMechInfo()

    local allObjects = LoGetWorldObjects()
    local unitList = {}

    for id, obj in pairs(allObjects) do
        if obj.LatLongAlt then
            local dcsType1 = 0
            local dcsType2 = 0
            if obj.Type then
                dcsType1 = obj.Type.level1
                dcsType2 = obj.Type.level2
            end

            local appCat = 3 
            if dcsType1 == 1 then 
                if dcsType2 == 2 then appCat = 2 else appCat = 1 end
            elseif dcsType1 == 2 then appCat = 3 
            elseif dcsType1 == 3 then appCat = 4 
            elseif dcsType1 == 4 then appCat = 0 end 

            local finalName = obj.Name or "Unknown"
            local coal = obj.CoalitionID or 0

            table.insert(unitList, {
                i = id, n = finalName, c = appCat, co = coal,
                la = round(obj.LatLongAlt.Lat, 6),
                lo = round(obj.LatLongAlt.Long, 6),
                a = math.floor(obj.LatLongAlt.Alt * 3.28084),
                h = round(obj.Heading, 4)
            })
        end
    end

    local packet = {
        type = "simUpdate",
        ownship = { lat = lat, lon = lon, alt = alt, hdg = hdg, name = uName, group = gName },
        payload = myPayload, weather = myWeather, mech = myMech, units = unitList
    }

    return JSON:encode(packet)
end

-- --- SOCKET HANDLING ---

function LuaExportStart()
    currentState = STATE_DISCONNECTED
    
    -- Initialize Command Listener (THE EAR)
    cmdServer = socket.tcp()
    cmdServer:bind("127.0.0.1", cmdPort)
    cmdServer:listen(1)
    cmdServer:settimeout(0)
end

function LuaExportStop()
    if tcpClient then
        tcpClient:close()
        tcpClient = nil
    end
    -- Close the Ear
    if cmdServer then
        cmdServer:close()
        cmdServer = nil
    end
end

-- NEW: Process incoming commands from Node.js every frame
function LuaExportBeforeNextFrame()
    if cmdServer then
        local client = cmdServer:accept()
        if client then
            client:settimeout(0)
            local data, err = client:receive()
            if data then
                -- Parse format "DeviceID:ButtonID:Value"
                for dev, btn, val in string.gmatch(data, "(%d+):(%d+):([%d%.%-]+)") do
                    local device = GetDevice(tonumber(dev))
                    if device then
                        device:performClickableAction(tonumber(btn), tonumber(val))
                    end
                end
            end
            client:close()
        end
    end
end

function LuaExportActivityNextEvent(t)
    local tNext = t + updateInterval

    -- 1. IF DISCONNECTED: TRY TO CREATE OUTBOUND SOCKET
    if currentState == STATE_DISCONNECTED then
        tcpClient = socket.tcp()
        tcpClient:settimeout(0) 
        local res, err = tcpClient:connect(host, port)
        if res == 1 then
            currentState = STATE_CONNECTED
        elseif err == "timeout" then
            currentState = STATE_CONNECTING 
        else
            tcpClient:close()
            tcpClient = nil
            tNext = t + 5.0 
        end

    -- 2. IF CONNECTING
    elseif currentState == STATE_CONNECTING then
        local read, write, err = socket.select(nil, {tcpClient}, 0)
        if err then
            currentState = STATE_DISCONNECTED
            tcpClient:close()
            tcpClient = nil
        elseif #write > 0 then
            currentState = STATE_CONNECTED
        end

    -- 3. IF CONNECTED: SEND OUTBOUND TELEMETRY
    elseif currentState == STATE_CONNECTED then
        local status, jsonData = pcall(safeGetData)
        if status and jsonData then
            local bytes, err = tcpClient:send(jsonData .. "\n")
            if not bytes then 
                currentState = STATE_DISCONNECTED
                tcpClient:close()
                tcpClient = nil
            end
        end
    end

    return tNext
end