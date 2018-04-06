import fetch from 'node-fetch';

const emoji = {
  up: '\u2B06',
  down: '\u2B07',
  error: '\u274C'
};

const shouldLog = process.env.LOG_REQUESTS;

function handleResponse( response ) {
  if ( response.ok ) {
    const contentType = response.headers.get( 'content-type' );
    const results = contentType && ~contentType.indexOf( 'application/json' )
      ? response.json()
      : response.text();
    return results
      .then( res => {
        if ( shouldLog ) {
          console.log( `${emoji.down} Fetch response: ${response.url}`, res );
        }
        return res;
      })
      .catch( err => {
        if ( shouldLog ) {
          console.error( `${emoji.error} Fetch error: ${response.url}`, err );
        }
      });
  } else {
    // if we get an error, try to jsonify and return response. if there is
    // an error when doing jsonification, just send text.
    return response.json()
      .then( json => ( { response: json, code: response.status }  ) )
      .catch( () => ( { response: response.statusText, code: response.status } ) )
      .then( results => {
        if ( shouldLog ) {
          console.error( `${emoji.error} Fetch error: ${response.url}`, results );
        }
        return results;
      })
      .then( results => Promise.reject( results ) );
  }
}

export default function fetchParse( url, options ) {
  if ( shouldLog ) {
    console.log( `${emoji.up} Fetch request: ${url}`, options );
  }

  return fetch( url, options ).then( response => handleResponse( response ) );
}