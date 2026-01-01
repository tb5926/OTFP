-- OnTheFlyPlanner : Script from Ops (DCS Wev Viewer)

OnTheFlyPlanner = {}

-- create socket once sim is started
function OnTheFlyPlanner:onSimulationStart()
    local socket = require("socket")
    self.server = assert(socket.bind("127.0.0.1", 58080))
    self.server:settimeout(0)
    self.targetCamera = nil  -- camera position for lerping
    self.staticObjects = {}  -- stores dynamically created static objects
    self.isRunning = true
end

-- close sockets
function OnTheFlyPlanner:onSimulationStop()
    if self.server then
        self.server:close()
        self.server = nil
    end
end

-- runs every frame
function OnTheFlyPlanner:onSimulationFrame()
    for _, server in ipairs({self.server}) do
        if server then
            local client = server:accept()
            if client then
                client:settimeout(60)
                local request, err = client:receive()
                if not err then
                    local method, path, slug, queryString = request:match("^(%w+)%s(/[^%?]+)([^%?]*)%??(.*)%sHTTP/%d%.%d$")
                    local headers = self:getHeaders(client)
                    local data = self:getBodyData(client, headers)
                    if slug == "" then slug = nil end
                    local query = {}
                    for key, value in queryString:gmatch("([^&=?]+)=([^&=?]+)") do
                        query[key] = value
                    end
                    local response = self.response200
                    if method == "OPTIONS" then
                        client:send(self:responseOptions())
                    else
                        local code = nil
                        if method == "GET" and path == "/health" then
                            code, result = self:getHealth()
                        elseif method == "GET" and path == "/mission-data" then
                            code, result = self:getMissionData()
                        elseif method == "GET" and path == "/position-player" then
                            code, result = self:getPositionPlayer()
                        elseif method == "GET" and path == "/player-id" then
                            code, result = self:getPlayerId()
                        elseif method == "GET" and path == "/export-world-objects" then
                            code, result = self:getExportWorldObjects()
			elseif method == "GET" and path == "/engine-info" then
    			    code, result = self:getEngineInfo()
                        elseif method == "GET" and path == "/payload-info" then
                            code, result = self:getPayloadInfo()
                        end
                        if code == 200 then                            
                            client:send(self:response200(result))
                        else
                            client:send(self:response404())
                        end
                    end
                end
                client:close()
            end
        end
    end
end


-- yet another serialize helper
function OnTheFlyPlanner:serializeTable(t)
    if type(t) ~= "table" then
        return tostring(t)
    end
    local str = "{"
    for k, v in pairs(t) do
        local key = type(k) == "string" and string.format("%q", k) or tostring(k)
        local value
        if type(v) == "table" then
            value = self:serializeTable(v)
        elseif type(v) == "string" then
            value = string.format("%q", v)
        else
            value = tostring(v)
        end
        str = str .. "[" .. key .. "]=" .. value .. ","
    end
    return str .. "}"
end

-- reads http headers
function OnTheFlyPlanner:getHeaders(client)
    local headers = {}
    while true do
        local line, err = client:receive()
        if err or line == "" then break end
        local key, value = line:match("^(.-):%s*(.*)$")
        if key and value then
            headers[key:lower()] = value
        end
    end
    return headers
end

-- reads http body, returns json
function OnTheFlyPlanner:getBodyData(client, headers)
    local body = nil
    if headers["content-length"] then
        local contentLength = tonumber(headers["content-length"])
        if contentLength > 0 then
            local json, err = client:receive(contentLength)
            if not err then
                local success, data = pcall(net.json2lua, json)
                if success then
                    body = data
                end
            end
        end
    end
    return body
end

-- default http headers
function OnTheFlyPlanner:defaultHeaders()
    return "Access-Control-Allow-Origin: *\r\n"
        .. "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS\r\n"
        .. "Access-Control-Allow-Headers: Content-Type\r\n"
end

-- options response
function OnTheFlyPlanner:responseOptions()
    return "HTTP/1.1 204 No Content\r\n"
        .. "Access-Control-Max-Age: 86400\r\n"
        .. self:defaultHeaders() .. "\r\n"
end

-- 200 response
function OnTheFlyPlanner:response200(data)
    return "HTTP/1.1 200 OK\r\n"
        .. "Content-Type: application/json\r\n"
        .. self:defaultHeaders() .. "\r\n"
        .. (data and net.lua2json(data) or "")
end

-- 404 response
function OnTheFlyPlanner:response404()
    return "HTTP/1.1 404 Not Found\r\n"
        .. "Content-Type: text/plain\r\n"
        .. self:defaultHeaders() .. "\r\n"
        .. "404 Not Found"
end



-- degrees to radians
function OnTheFlyPlanner:deg2rad(degrees)
    if degrees < 0 then
        degrees = degrees + 360
    end
    return degrees * (math.pi / 180)
end

-- health check
function OnTheFlyPlanner:getHealth()
    local result = {
        missionServerRunning = true,
        missionRunning = DCS.getCurrentMission() ~= nil,
    }
    return 200, result
end

-- returns mission data
function OnTheFlyPlanner:getMissionData()
    local result = DCS.getCurrentMission()
    return 200, result
end

function OnTheFlyPlanner:getEngineInfo()
    local engineInfo = Export.LoGetEngineInfo()
    if engineInfo then
        -- Ensure all fields are present and provide default values if not
        return 200, {
            RPM_Left = engineInfo.RPM.left,
            RPM_Right = engineInfo.RPM.right,
            Temp_Left = engineInfo.Temperature.left,
            Temp_Right = engineInfo.Temperature.right,
            FuelFlow_Left = engineInfo.FuelConsumption.left,
            FuelFlow_Right = engineInfo.FuelConsumption.right,
            Fuel_Internal = engineInfo.fuel_internal,
            Fuel_External = engineInfo.fuel_external
        }
    else
        -- Log the error for debugging if engine data is not available
        print("Error: No engine data available")
        return 404, { error = "No engine data available" }
    end
end

-- returns player object
function OnTheFlyPlanner:getPositionPlayer()
    local result = Export.LoGetSelfData()
    return 200, result
end

-- returns Export world objects
function OnTheFlyPlanner:getExportWorldObjects()
    local result = Export.LoGetWorldObjects()
    return 200, result
end

function OnTheFlyPlanner:getPlayerId()
    local id = DCS.getPlayerUnit()
    return 200, id
end

-- returns current payload/weapons
function OnTheFlyPlanner:getPayloadInfo()
    -- This DCS function returns the current stations and what is on them
    local result = Export.LoGetPayloadInfo()
    if result then
        return 200, result
    else
        -- If player is spectator or dead, this might return nil
        return 404, { error = "No payload data available" }
    end
end



DCS.setUserCallbacks({
    onSimulationStart = function() OnTheFlyPlanner:onSimulationStart() end,
    onSimulationStop = function() OnTheFlyPlanner:onSimulationStop() end,
    onSimulationFrame = function() OnTheFlyPlanner:onSimulationFrame() end	
})
