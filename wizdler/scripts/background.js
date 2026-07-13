// The action icon behaves like the old page action: disabled everywhere until a
// content script reports it found a WSDL document in its tab.
chrome.runtime.onInstalled.addListener(function() {
	chrome.action.disable();
});

chrome.runtime.onStartup.addListener(function() {
	chrome.action.disable();
});

// Tab-specific enable state survives navigation, so reset it when the tab starts
// loading a new document.
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) {
	if (changeInfo.status === 'loading')
		chrome.action.disable(tabId);
});

function ajax(request, sendResponse) {
	var options = {
		method: request.type || 'GET',
		headers: request.headers ? Object.assign({}, request.headers) : {}
	};
	if (request.contentType)
		options.headers['Content-Type'] = request.contentType;
	if (request.data)
		options.body = request.data;

	fetch(request.url, options).then(function(response) {
		if (!response.ok)
			throw new Error('Request failed with status ' + response.status);
		return response.text();
	}).then(function(text) {
		sendResponse({
			type: 'success',
			args: [text]
		});
	}).catch(function() {
		sendResponse({
			type: 'error'
		});
	});
}

chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
		var command = request && request.command;
		switch (command) {
			case 'showPageAction':
				chrome.action.enable(sender.tab.id);
				sendResponse();
				break;

			case 'openEditor':
				var opts = {
					url: chrome.runtime.getURL('editor.html') +
						'#wsdl=' + encodeURIComponent(request.url) +
						'&addr=' + encodeURIComponent(request.address) +
						'&title=' + encodeURIComponent(request.title)
				};
				chrome.tabs.create(opts);
				sendResponse();
				break;

			case 'ajax':
				ajax(request, sendResponse);
				return true;

			default:
				sendResponse();
		}
	}
);
