import {} from 'dotenv/config';

import http from 'http';
import express from 'express';
import {} from 'csv-express';
import morgan from 'morgan';
import bodyParser from 'body-parser';

import { summary } from './queries';

const app = express();
app.server = http.createServer( app );

// logger
app.use( morgan( 'dev' ) );

app.use( bodyParser.json() );

app.post( '/summary', summary );

app.server.listen( process.env.PORT || 8080, () => {
	console.log( `Started on port ${app.server.address().port}` );
});

export default app;