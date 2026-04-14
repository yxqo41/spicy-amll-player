/**
 * Netlify Proxy Function
 * Handles secure API requests for Musixmatch and Genius.
 */

exports.handler = async (event) => {
  const { provider, ...params } = event.queryStringParameters;

  // Add CORS headers for local development
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (provider === 'musixmatch') {
    const token = process.env.MUSIXMATCH_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ error: "Missing MUSIXMATCH_TOKEN" }), headers };

    const baseUrl = "https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get";
    const url = new URL(baseUrl);
    
    // Append all passed parameters
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    url.searchParams.append('usertoken', token);

    try {
      const response = await fetch(url.toString(), {
        headers: { 'User-Agent': 'Musixmatch-Desktop/1.0' }
      });
      const data = await response.json();
      return { statusCode: 200, body: JSON.stringify(data), headers };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: "Musixmatch proxy failed", message: err.message }), headers };
    }
  }

  if (provider === 'genius') {
    const token = process.env.GENIUS_TOKEN;
    if (!token) return { statusCode: 500, body: JSON.stringify({ error: "Missing GENIUS_TOKEN" }), headers };

    const endpoint = params.endpoint || '/search';
    delete params.endpoint;

    const url = new URL(`https://api.genius.com${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    url.searchParams.append('access_token', token);

    try {
      const response = await fetch(url.toString());
      const data = await response.json();
      return { statusCode: 200, body: JSON.stringify(data), headers };
    } catch (err) {
      return { statusCode: 500, body: JSON.stringify({ error: "Genius proxy failed", message: err.message }), headers };
    }
  }

  return { 
    statusCode: 400, 
    body: JSON.stringify({ error: "Invalid provider specified" }), 
    headers 
  };
};
