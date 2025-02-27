import URL from 'url-parse';

/**
 * Returns a sanitized url, which could be a search engine url if
 * a keyword is detected instead of a url
 *
 * @param {string} input - String corresponding to url input
 * @param {string} searchEngine - Protocol string to append to URLs that have none
 * @param {string} defaultProtocol - Protocol string to append to URLs that have none
 * @returns {string} - String corresponding to sanitized input depending if it's a search or url
 */
export default function onUrlSubmit(input, searchEngine = 'Google', defaultProtocol = 'https://') {
	//Check if it's a url or a keyword
	const res = input.match(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w.-]+)+[\w\-._~:/?#[\]@!&',;=.+]+$/g);
	if (res === null) {
		// In case of keywords we default to google search
		let searchUrl = 'https://www.google.com/search?q=' + escape(input);
		if (searchEngine === 'DuckDuckGo') {
			searchUrl = 'https://duckduckgo.com/?q=' + escape(input);
		}
		return searchUrl;
	}
	const hasProtocol = input.match(/^[a-z]*:\/\//);
	const sanitizedURL = hasProtocol ? input : `${defaultProtocol}${input}`;
	return sanitizedURL;
}

export function getHost(url) {
	const urlObj = new URL(url);
	const { hostname } = urlObj;
	return hostname;
}
