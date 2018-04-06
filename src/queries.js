import moment from 'moment';
import parser from 'csv-parse/lib/sync';
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

// Use this to ensure standardized row format when creating the output csv by
// extending all response objects with null fields. Also contains row headers
const baseResponseObject = {
  latitude: null,
  longitude: null,
  date: null,
  startDate: null,
  endDate: null,
  images: null,
  imageCount: null,
  latestImage: null,
  latestImageAcquired: null
};

const momentQueryFormatString = 'YYYY-MM-DD HH:mm:ss';

const parseFormData = formData => Object.entries( formData ).map( ([ key, value ]) => `${key}=${value}` ).join('&');

const queryCatalogForPoint = point => {
  const { longitude: x, latitude: y, date, startDate, endDate } = point;
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

  if ( startDate && endDate ) {
    const startDateMoment = moment( startDate );
    const endDateMoment = moment( endDate );

    const options = {
      ...queryOptions,
      body: parseFormData({
        ...formData,
        returnCountOnly: true,
        where: `collect_time_start >= '${startDateMoment.format(momentQueryFormatString)}' AND collect_time_start <= '${endDateMoment.format(momentQueryFormatString)}'`
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
    ...result.features[0]
      ? { 
          latestImage: result.features[0].attributes.browse_url,
          latestImageAcquired: moment( result.features[0].attributes.collect_time_start ).format( 'dddd MMMM Do YYYY h:mm:ss a' )
        }
      : {
          latestImage: 'no result',
          latestImageAcquired: null
        } 
  }));
};
const queryCatalogForPoints = points => Promise.all( points.map( point => queryCatalogForPoint( point ) ) );

const parseCsv = points => {
  const parsed = parser( points );

  const keys = parsed[0];
  return parsed.slice( 1 ).map( pointRow => pointRow.reduce( ( point, attribute, index ) => {
    if ( attribute != null ) point[keys[index]] = attribute;
    return point;
  }, {} ));
};

const summaryGeoJson = async ( res, points ) => {
  const results = await queryCatalogForPoints( points );

  res.json( results );
};

const summaryCsv = async ( res, points ) => {
  const results = await queryCatalogForPoints( points );

  // Need to standardize row format to ensure matching columns
  const parsedResults = results.map( ({ images, ...result }) => Object.values({
    ...baseResponseObject,
    ...result,
    images: ( images && images.join(' | ') ) || null
  }).join(','));

  const responseCsv = [
    Object.keys( baseResponseObject ),
    ...parsedResults
  ].join('\n');

  res.header( 'Content-Type', 'text/csv' ).send( responseCsv );
};

const allowedFormats = [ 'json', 'csv' ];
export function summary( req, res ) {
  console.log(req.body);
  const { input: inputFormat, output: outputFormat } = req.query;

  if ( !inputFormat || !outputFormat || !allowedFormats.includes( inputFormat ) || !allowedFormats.includes( outputFormat ) ) {
    return res.status( 400 ).send( `input and output query params with value 'json' or 'csv' required` );
  }

  const points = inputFormat === 'json' ? req.body.points : parseCsv( req.body, { relax: true } );

  return outputFormat === 'json' ? summaryGeoJson( res, points ) : summaryCsv( res, points );
}