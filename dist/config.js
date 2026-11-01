// Enable live mode ONLY after implementing and securing docs/API_CONTRACT.md.
// No Garmin, Grok, or bot credentials belong in this browser application.
export const config = Object.freeze({mode:'demo',apiBase:'/api/v1',requestTimeoutMs:12000,accountScope:null,csrfToken:null});
