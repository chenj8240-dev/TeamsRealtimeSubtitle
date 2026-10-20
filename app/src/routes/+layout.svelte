<script>
	// Fonts are bundled, not fetched: the Tauri CSP is `default-src 'self'`, so a webfont CDN
	// would be blocked. Imported before app.css so the @font-face rules land before the tokens
	// that reference them.
	import '@fontsource/archivo/400.css';
	import '@fontsource/archivo/500.css';
	import '@fontsource/archivo/600.css';
	import '@fontsource/archivo/700.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import '@fontsource/ibm-plex-mono/600.css';
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}
