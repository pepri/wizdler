chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
		var command = request && request.command;
		switch (command) {
			case 'showPageAction':
				chrome.pageAction.show(sender.tab.id);
				sendResponse();
				break;

			case 'openEditor':
				var opts = {
					url: chrome.runtime.getURL('editor.html') +
						'#wsdl=' + encodeURIComponent(request.url) +
						'&addr=' + encodeURIComponent(request.address) +
						'&title=' + encodeURIComponent(request.title)
				};
				chrome.tabs.create(opts, function(tab) {
					// TODO: send resources, so it does not need to redownload
					// (only for the first time; after pressing F5, we want to redownload)
					//chrome.tabs.sendMessage(tab.id, request, function() {
					//	sendResponse();
					//});
				});
				break;

			case 'ajax':
				var xhr = new XMLHttpRequest;
				xhr.onreadystatechange = function() {
					if (xhr.readyState == 4) {
						if (xhr.status === 200 || xhr.status === 0) {
							sendResponse({
								type: 'success',
								args: [xhr.responseText]
							});
						} else {
							sendResponse({
								type: 'error'
							});
						}
					}
				}
				xhr.open(request.type, request.url, true);

				if (command.contentType)
					request.setRequestHeader('Content-Type', command.contentType);

				var headers = command.headers;
				if (headers)
					for (var x in headers)
						if (headers.hasOwnProperty(x))
							xhr.setRequestHeader(x, headers[x]);

				xhr.send(request.data);
				return true;

			default:
				sendResponse();
		}
	}
);
