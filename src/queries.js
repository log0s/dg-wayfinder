import moment from 'moment';
import parser from 'csv-parse/lib/sync';

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
const baseSummaryResponseObject = {
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

const queryCatalogForPointSummary = point => {
  const { longitude: x, latitude: y, date, startDate, endDate } = point;
  const baseResponse = {
    ...baseSummaryResponseObject,
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
const queryCatalogForSummary = points => Promise.all( points.map( point => queryCatalogForPointSummary( point ) ) );

const queryCatalogForPointIdentifiers = point => {
  const { longitude: x, latitude: y } = point;
  
  const options = {
    method: 'POST',
    headers: {
      'x-api-key': process.env.DG_CATALOG_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: parseFormData({
      f: 'json',
      returnGeometry: false,
      outFields: 'image_identifier',
      spatialRel: 'esriSpatialRelContains',
      geometryType: 'esriGeometryPoint',
      geometry: JSON.stringify({
        x,
        y,
        spatialReference: {
          wkid: 4326
        }
      })
    })
  };
  return fetchParse( process.env.DG_CATALOG_API_URL, options ).then( result => {
    const { count, identifiers } = result.features.reduce( ( summary, feature ) => {
      summary.count++;
      summary.identifiers.push( feature.attributes.image_identifier );

      return summary;
    }, { count: 0, identifiers: [] } );

    return {
      ...point,
      count,
      identifiers
    }
  });
};
const queryCatalogForIdentifiers = points => Promise.all( points.map( point => queryCatalogForPointIdentifiers( point ) ) );

const parseCsv = points => {
  const parsed = parser( points );

  const keys = parsed[0];
  return parsed.slice( 1 ).map( pointRow => pointRow.reduce( ( point, attribute, index ) => {
    if ( attribute != null ) point[keys[index]] = attribute;
    return point;
  }, {} ));
};

const parseGeoJsonSummary = ({ features }) => {
  return features.map( ({ properties: { date, startDate, endDate }, geometry: { coordinates } }) => ({
    longitude: coordinates[0],
    latitude: coordinates[1],
    date,
    startDate,
    endDate
  }));
};

const parseGeoJsonIdentifiers = ({ features }) => {
  return features.map( ({ geometry: { coordinates } }) => ({
    longitude: coordinates[0],
    latitude: coordinates[1]
  }));
}

const summaryGeoJson = async ( res, points ) => {
  const results = await queryCatalogForSummary( points );

  const parsedResults = {
    type: 'FeatureCollection',
    features: results.map( ({ longitude, latitude, ...properties }) => {
      const parsedProperties = Object.entries( properties ).reduce( ( propertyObject, [ key, value ] ) => {
        if ( value !== '' ) propertyObject[key] = value;
        return propertyObject
      }, {});

      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [ parseFloat( longitude ), parseFloat( latitude ) ]
        },
        properties: parsedProperties
      }
    })
  };

  res.json( parsedResults );
};

const summaryCsv = async ( res, points ) => {
  const results = await queryCatalogForSummary( points );

  // Need to standardize row format to ensure matching columns
  const parsedResults = results.map( ({ images, ...result }) => Object.values({
    ...baseSummaryResponseObject,
    ...result,
    images: ( images && images.join && images.join('\t') ) || images || null
  }).join(','));

  const responseCsv = [
    Object.keys( baseSummaryResponseObject ),
    ...parsedResults
  ].join('\n');

  res.header( 'Content-Type', 'text/csv' ).send( responseCsv );
};

const identifiersGeoJson = async ( res, points ) => {
  const results = await queryCatalogForIdentifiers( points );

  const parsedResults = {
    type: 'FeatureCollection',
    features: results.map( ({ longitude, latitude, ...properties }) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [ parseFloat( longitude ), parseFloat( latitude ) ]
      },
      properties
    }))
  };

  res.json( parsedResults );
};

const identifiersCsv = async ( res, points ) => {
  const results = await queryCatalogForIdentifiers( points );

  // Use tabs to separate identifiers since we are creating a CSV 
  const parsedResults = results.map( ({ identifiers, ...result }) => Object.values({
    ...result,
    identifiers: identifiers.join('\t') 
  }).join(',') );

  const responseCsv = [
    [ 'longitude', 'latitude', 'count', 'identifiers' ],
    ...parsedResults
  ].join('\n');

  res.header( 'Content-Type', 'text/csv' ).send( responseCsv );
};

const allowedFormats = [ 'geojson', 'csv' ];
export function summary( req, res ) {
  const { input: inputFormat, output: outputFormat } = req.query;

  if ( !inputFormat || !outputFormat || !allowedFormats.includes( inputFormat ) || !allowedFormats.includes( outputFormat ) ) {
    return res.status( 400 ).send( `input and output query params with value 'geojson' or 'csv' required` );
  }

  const points = inputFormat === 'geojson' ? parseGeoJsonSummary( req.body ) : parseCsv( req.body );

  return outputFormat === 'geojson' ? summaryGeoJson( res, points ) : summaryCsv( res, points );
}

export function identifiers( req, res ) {
  const { input: inputFormat, output: outputFormat } = req.query;

  if ( !inputFormat || !outputFormat || !allowedFormats.includes( inputFormat ) || !allowedFormats.includes( outputFormat ) ) {
    return res.status( 400 ).send( `input and output query params with value 'geojson' or 'csv' required` );
  }

  const points = inputFormat === 'geojson' ? parseGeoJsonIdentifiers( req.body ) : parseCsv( req.body );

  return outputFormat === 'geojson' ? identifiersGeoJson( res, points ) : identifiersCsv( res, points );
}