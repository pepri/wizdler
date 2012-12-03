chrome.extension.onRequest.addListener(
	function(request, sender, sendResponse) {
		var command = request && request.command;
		switch (command) {
			case 'showPageAction':
				chrome.pageAction.show(sender.tab.id);
				sendResponse();
				break;
			case 'openEditor':
				var opts = {
					url: chrome.extension.getURL('editor.html') +
						'#wsdl=' + encodeURIComponent(request.url) +
						'&addr=' + encodeURIComponent(request.address) +
						'&title=' + encodeURIComponent(request.title)
				};
				chrome.tabs.create(opts, function(tab) {
					// TODO: send resources, so it does not need to redownload 
					// (only for the first time; after pressing F5, we want to redownload)
					//chrome.tabs.sendRequest(tab.id, request, function() {
					//	sendResponse();
					//});
				});
				break;
			default:
				sendResponse();
		}
	}
);
