function initCheckers(api, next)
{
	api.nodeChecker = {};
	api.nodeChecker.apiData = {}; // cache for checker varaible storage
	api.nodeChecker.checkers = {}; // list of checkers (like actions)
	
	/////////////////////////////////////////////////////////////////////////////////////
	// new modules
	api.mysql = require('mysql');
	api.https = require('https');
	api.querystring = require('querystring');
	
	/////////////////////////////////////////////////////////////////////////////////////
	// the actual check
	api.runCheck = function(api, check){
		var cacheName = "nodeCheckerData_" + check.name;
		api.cache.load(api, cacheName, function(data){
			try{
				if (data == null){ data = []; }
				var startTime = new Date().getTime();
				check.params._data = data;
				api.nodeChecker.checkers[check.type].check(api, check.params, function(response){
					response.timeStamp = new Date().getTime();
					if(response.dataOverride != true){
						data.push(response);
					}else{
						data = response._data;
					}
					while( data.length > check.entriesToKeep){
						data.shift();
					}
					api.cache.save(api, cacheName, data, null, function(resp){
						var requestDurationSeconds = (response.timeStamp - startTime)/1000;
						api.sendSocketCheckResuts(check, response);
						api.log("checked -> "+check.name+":"+check.type+" in "+requestDurationSeconds+"s", "magenta");
						setTimeout(api.runCheck, (check.frequencyInSeconds * 1000), api, check);
					});
				});
			}catch(e){
				api.log(e, "red");
				api.log(check.name+":"+check.type+" is not a check I know how to do.  Check checks.json", "red");
				api.log(" > "+check.name+" will not be processed", "red");
			}
		});
	}
	
	/////////////////////////////////////////////////////////////////////////////////////
	// send socket people a message 
	api.sendSocketCheckResuts = function(check, response){

		var message = {
			context: "check",
			type: check.type,
			requestDurationSeconds: check.requestDurationSeconds,
			name: check.name,
			number: response.number,
			error: response.error,
			check: response.check,
			serverTime: new Date()
		};
		
		var connection = {
			id: 1,
			type: "socket",
			room: check.name,
			messageCount: 0,
			public: {id: 1 }
		}
		
		api.socketServer.socketRoomBroadcast(api, connection, message);
		
		connection.room = "all";
		api.socketServer.socketRoomBroadcast(api, connection, message);
	}
	
	/////////////////////////////////////////////////////////////////////////////////////
	// add a util for param sanitization
	api.utils.checkParamChecker = function(api, required_params, params, mode){
		var error = false;
		if(mode == null){mode = "all";}
		if(mode == "all"){
			required_params.forEach(function(param){
				if(error == false && (params[param] === undefined || (params[param] != null && params[param].length == 0))){
					error = param + " is a required parameter for this action";
				}
			});
		}
		if(mode == "any"){
			var paramString = "";
			var found = false;
			required_params.forEach(function(param){
				if(paramString != ""){paramString = paramString + ",";}
				paramString = paramString + " " + param;
				if(params[param] != null){
					found = true;
				}
			});
			if(found == false)
			{
				error = "none of the required params for this action were provided.  Any of the following are required: " + paramString;
			}
		}
		return error;
	}
	
	/////////////////////////////////////////////////////////////////////////////////////
	// Setup Message Queue
	api.messages = {};
	api.messages.messages = []; // {message: string, timestamp: datetime}
	api.messages.messagesToKeep = api.configData.messagesToKeep;
	
	/////////////////////////////////////////////////////////////////////////////////////
	// Load checkers
	api.fs.readdirSync("./checkers").forEach( function(file) {
		if (file != ".DS_Store"){
			var checkerName = file.split(".")[0];
			api.nodeChecker.checkers[checkerName] = require("./checkers/" + file)["checker"];
			api.nodeChecker.apiData[checkerName] = {};
			api.log("checker loaded: " + checkerName, "yellow");
		}
	});
	
	/////////////////////////////////////////////////////////////////////////////////////
	// load and run checks!
	try{
		api.checks = JSON.parse(api.fs.readFileSync('./checks.json','utf8'));
	}catch(e){
		console.log(e);
		api.log("Loading example checks.");
		api.checks = [
			{
				"name":"random_numbers",
				"type":"randomNumber",
				"frequencyInSeconds":2,
				"entriesToKeep":100,
				"axisLabel" : "Random Number",
				"params":{}
			},
			{
				"name":"ping_google_com",
				"type":"ping",
				"frequencyInSeconds":10,
				"entriesToKeep":100,
				"axisLabel": "ping duration (ms)",
				"params":{
					"hostname":"google.com"
				}
			},
			{
				"name":"http_google_com",
				"type":"httpRequest",
				"frequencyInSeconds":10,
				"entriesToKeep":100,
				"axisLabel": "http request time (ms)",
				"params":{
					"hostname":"http://www.google.com",
					"matcher":"</div>"
				}
			}
		];
	}
	api.checks.forEach(function(check){
		process.nextTick(function() { api.runCheck(api, check) });
		api.log("loaded check: "+check.name, "magenta");
	});
	
	next();
}

/////////////////////////////////////////////////////////////////////////////////////
// GO!

var actionHero = require("actionHero").actionHero;
actionHero.start({}, function(api){
	initCheckers(api, function(){
		api.log("Loading complete!", ['green', 'bold']);
	});
});