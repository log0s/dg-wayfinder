import {} from 'dotenv/config';

import http from 'http';
import express from 'express';
import morgan from 'morgan';
import bodyParser from 'body-parser';

import { summary, identifiers } from './queries';

const app = express();
app.server = http.createServer( app );

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// logger
app.use( morgan( 'dev' ) );

app.use( bodyParser.json() );
app.use( bodyParser.text({ type: 'text/csv' }));

app.post( '/summary', summary );
app.post( '/identifiers', identifiers );

app.server.listen( process.env.PORT || 8080, () => {
	console.log( `Started on port ${app.server.address().port}` );
});

export default app;