
// ResourceManager is a Singleton, a centre repository of resources loaded by the page
var ResourceManager = {
		
	// Requests to be cleared, structured as 
	// {type : 'text' || 'JSON' || 'image', resourceTypeFunc : Object type etc, url : '', data : {}, processResource : function(resource){//do stuff with resource}}
	// {type : 'composite', requests : [array of requests for objects],  resourceTypeFunc}
	// {type : 'request', url : '', data : {}, processResource : function() { //Do stuff with resource once the request has been loaded and processed}}
	// additional contains additional parameters to prevent polluting object space unnecessarily

	// Array of requested objects
	waitingForResource : {},
	
	// Processing functions
	resourceProcessingFunctions : [],
	
	// Junk Div, a hidden div to attach elements to the dom so that they can be used as resources
	junkDiv : null,
	
	// The collection of accumulated resources
	resources : [],
	
	// Whether we are currently processing
	processingReqs : false,
	
	createKey : function (req) {
		var key;
	
		if (req.type != 'composite') {
			
			// Use JSON as resource key
			key = JSON.stringify({url : req.url, data : req.data, resType : req.resourceTypeFunc});
		}
		else {
			
			// Build key array based on the keys of the parameters
			var keyArray = [];
			for (var internalReqCounter = 0; internalReqCounter < req.requests.length; internalReqCounter ++) {
				keyArray.push(ResourceManager.createKey(req.requests[internalReqCounter]));
			}
			key = JSON.stringify(keyArray);
		}

		return hex_md5(key);
//		return (key);
	},
	
	// Shorthand function for create requests
	createRequest : function(iType, rTF, iUrl, iData, iPR) {
		return {type : iType, resourceTypeFunc : rTF, url : iUrl, data : iData, processResource : iPR};
	},
	addRequest : function(inReq) {
		
		if (!inReq.key) inReq.key = ResourceManager.createKey(inReq);

		// Check if it has already been loaded
		if (ResourceManager.resources[inReq.key]) {
			inReq.processResource(ResourceManager.resources[inReq.key], inReq);
		}

		// Else check if it is currently being loaded via ajax / image.src etc
		else if (ResourceManager.waitingForResource[inReq.key] && !inReq.followup) {
			
			//console.log('Waiting for ' + inReq.key);
			ResourceManager.waitingForResource[inReq.key].push(inReq);
		}

		// Else add to list of items to be loaded
		else {
			// If it is a followup, it doesn't need to have its' waitingForResource array implemented
			if (!inReq.followup) {
				ResourceManager.waitingForResource[inReq.key] = [];
				ResourceManager.waitingForResource[inReq.key].push(inReq);
			}
			ResourceManager.processRequest(inReq);
		}
	},
	processRequest : function(inReq) {
		
		switch(inReq.type) {
			case 'request' :
				ResourceManager.processRequestRequest(inReq);
				break;
			case 'text' : case 'JSON' : 
				ResourceManager.processJSONRequest(inReq);
				break;
			case 'composite' :
				ResourceManager.processCompositeRequest(inReq);
				break;
			case 'script' : 
				ResourceManager.processScriptRequest(inReq);
				break; // Scripts added to header of the document
			case 'image' : 
				ResourceManager.processImageRequest(inReq);
				break; // Do nothing yet, later attach an image to the junk div, and attach a success function to the onload function in the same way as JSON/text
			case 'video' : 
				ResourceManager.processVideoRequest(inReq);
				break;
			default : 
				if (console) console.log('Unable to process req of type : ' + inReq.type);
				break;
		}
	},
	processScriptRequest : function(req) {},
	processImageRequest : function(req) {},
	processVideoRequest : function(req) {},
	processJSONRequest : function(inReq) {		
		jQuery.ajax({
			url: inReq.url,
			data : inReq.data,
			success: function(data) {
			
				if (inReq.resourceTypeFunc && ResourceManager.resourceProcessingFunctions[inReq.resourceTypeFunc]) ResourceManager.resources[inReq.key] = ResourceManager.resourceProcessingFunctions[inReq.resourceTypeFunc](ResourceManager.gl, data, ResourceManager.junkDiv);
				else ResourceManager.resources[inReq.key] = data;

				for (var counter = 0; counter < ResourceManager.waitingForResource[inReq.key].length; counter ++) {
					var creq = ResourceManager.waitingForResource[inReq.key][counter];
					creq.processResource(ResourceManager.resources[inReq.key], creq);
				}
				delete ResourceManager.waitingForResource[inReq.key];
			},
			error : function() {
				if (console) console.log('Unable to retrieve ' + JSON.Stringify(inReq));
			}
		});
	},
	processRequestRequest : function(inReq) {
		jQuery.ajax({
			url: inReq.url,
			data : inReq.data,
			success: function(newReq) {
						
				// Store value for future...
				ResourceManager.resources[inReq.key] = newReq;

				// Generate a new key for the new request
				newReq.key = ResourceManager.createKey(newReq);
				
				// Transfer the url if it doesn't exist in the pulled request
				if (!newReq.url) newReq.url = inReq.url;
				newReq.followup = true;
				
				// Apply the original processing function
				newReq.processResource = inReq.processResource;
				
				// Transfer the additional data
				newReq.additional = inReq.additional;
				
				// Transfer all the waiting requests to the new key
				ResourceManager.waitingForResource[newReq.key] = ResourceManager.waitingForResource[inReq.key];

				delete ResourceManager.waitingForResource[inReq.key];
				
				// Add the request to the queue to be processed
				ResourceManager.addRequest(newReq);
			},
			error : function() {
				if (console) console.log('Unable to retrieve ' + JSON.Stringify(inReq));
			}
		});
	},
	processCompositeRequest : function(req) {
		req.nResourcesProcessed = 0;
		req.resources = [];
		
		// ProcessResource gets called when the individual resources have been loaded
		var processResource = function(res, req) {
			req.masterReq.resources[req.id] = res;
			
			// Test to see if all of the resources have been loaded
			if (req.masterReq.nResourcesProcessed + 1 >= req.masterReq.requests.length) {
				
				// If the function exists, pass the resources loadedd as parameters
				if (req.masterReq.resourceTypeFunc && ResourceManager.resourceProcessingFunctions[req.masterReq.resourceTypeFunc])
					ResourceManager.resources[req.masterReq.key] = ResourceManager.resourceProcessingFunctions[req.masterReq.resourceTypeFunc](ResourceManager.gl, req.masterReq.resources, ResourceManager.junkDiv);
				else ResourceManager.resources[req.masterReq.key] = req.masterReq.resources;

				if (ResourceManager.waitingForResource[req.key].length > 1) console.log(['Processing more than one request for ', req.key]);
				for (var counter = 0; counter < ResourceManager.waitingForResource[req.masterReq.key].length; counter ++) {
					var creq = ResourceManager.waitingForResource[req.masterReq.key][counter];
					creq.processResource(ResourceManager.resources[req.masterReq.key], creq);
				}
				delete ResourceManager.waitingForResource[req.masterReq.key];
			}
			else req.masterReq.nResourcesProcessed ++;
		};
		
		// Go through each of the internal requests
		for (var internalReqCounter = 0; internalReqCounter < req.requests.length; internalReqCounter ++) {
			var currentReq = req.requests[internalReqCounter];
			
			// Assign its' own internal id, to use when inserting the resource back inside the master list of resources
			currentReq.id = internalReqCounter;
			
			// Assign URL if undefined
			if (!currentReq.url) currentReq.url = req.url;
			
			// Assign a reference to the master req
			currentReq.masterReq = req;
			
			// Assign the process Resource function (the same for every resource, co-ordinates them)
			currentReq.processResource = processResource;
			
			// Adds to resource manager for processing
			ResourceManager.addRequest(currentReq);
		}
	}
	
};
