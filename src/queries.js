import moment from 'moment';
import { arcgisToGeoJSON } from '@esri/arcgis-to-geojson-utils';

import fetchParse from './lib/fetch-parse';

const queryOptions = {
  method: 'POST',
  headers: {
    'x-api-key': process.env.DG_CATALOG_API_KEY,
    'Content-Type': 'application/x-www-form-urlencoded'
  }
};

const baseQueryFormData = {
  outFields: 'browse_url',
  spatialRel: 'esriSpatialRelContains',
  f: 'json',
  returnGeometry: false,
  geometryType: 'esriGeometryPoint'
};

// Use this to ensure standardized headers when using the csv-express headers functionality
// by extending all response objects with blank fields for anything undefined
const baseResponseObject = {
  lat: '',
  lng: '',
  date: '',
  dateRange: '',
  images: '',
  imageCount: '',
  latestImage: ''
};

const momentQueryFormatString = 'YYYY-MM-DD HH:mm:ss';

const parseFormData = formData => Object.entries( formData ).map( ([ key, value ]) => `${key}=${value}` ).join('&');

const queryCatalogForPoint = point => {
  const { lng: x, lat: y, date, dateRange } = point;
  const baseResponse = {
    ...baseResponseObject,
    ...point
  };

  let formData = {
    ...baseQueryFormData,
    geometry: JSON.stringify({
      x,
      y,
      spatialReference: {
        wkid: 4326
      }
    })
  };
  
  if ( date ) {
    const dateObject = moment( date );

    const options = {
      ...queryOptions,
      body: parseFormData({
        ...formData,
        where: `collect_time_start >= '${dateObject.startOf('day').format(momentQueryFormatString)}' AND collect_time_start <= '${dateObject.endOf('day').format(momentQueryFormatString)}'`
      })
    };
    return fetchParse( process.env.DG_CATALOG_API_URL, options ).then( result => ({
      ...point,
      images: result.features.length ? result.features.map( feature => feature.attributes.browse_url ) : 'no results'
    }));
  }

  if ( dateRange ) {
    const startDate = moment( dateRange[0] );
    const endDate = moment( dateRange[1] );

    const options = {
      ...queryOptions,
      body: parseFormData({
        ...formData,
        returnCountOnly: true,
        where: `collect_time_start >= '${startDate.format(momentQueryFormatString)}' AND collect_time_start <= '${endDate.format(momentQueryFormatString)}'`
      })
    };
    return fetchParse( process.env.DG_CATALOG_API_URL, options ).then( result => ({
      ...point,
      imageCount: result.count || 0
    }));
  } 

  const options = {
    ...queryOptions,
    body: parseFormData({
      ...formData,
      outFields: 'browse_url, collect_time_start',
      resultRecordCount: 1,
      orderByFields: 'collect_time_start DESC'
    })
  };
  return fetchParse( process.env.DG_CATALOG_API_URL, options ).then( result => ({
    ...point,
    latestImage: result.features[0]
      ? { 
          url: result.features[0].attributes.browse_url,
          acquired: moment( result.features[0].attributes.collect_time_start ).format( 'dddd, MMMM Do YYYY, h:mm:ss a' )
        }
      : 'no result' 
  }));
};
const queryCatalogForPoints = points => Promise.all( points.map( point => queryCatalogForPoint( point ) ) );

const parseCsv = csv => console.log( csv );

const summaryGeoJson = async ( res, points ) => {
  const results = await queryCatalogForPoints( points );

  res.json( results );
};

const summaryCsv = async ( res, points ) => {
  const results = await queryCatalogForPoints( points );

  // Need to standardize row format to ensure proper headers and stringify objects
  const parsedResults = results.map( ({ latestImage, ...result }) => ({
    ...baseResponseObject,
    ...result,
    latestImage: JSON.stringify( latestImage ) || ''
  }));

  res.csv( parsedResults, true );
};

const allowedFormats = [ 'json', 'csv' ];
export function summary( req, res ) {
  const { input: inputFormat, output: outputFormat } = req.query;

  if ( !inputFormat || !outputFormat || !allowedFormats.includes( inputFormat ) || !allowedFormats.includes( outputFormat ) ) {
    return res.status( 400 ).send( `input and output query params with value 'json' or 'csv' required` );
  }

  const points = inputFormat === 'json' ? req.body.points : parseCsv( req.body );

  return outputFormat === 'json' ? summaryGeoJson( res, points ) : summaryCsv( res, points );
}