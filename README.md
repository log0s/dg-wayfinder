# dg-wayfinder

This API is a layer on top of the [DG Image Catalog API](https://discoverdigitalglobe.readme.io/v1.7/reference). It is designed to aggregate queries in an easily useable way to allow non-expert users to get relevant information about geographic areas.

-------------------------------------------------------------------------------------------------------

## Development

```
# Initial local setup
git clone git@github.com:log0s/dg-wayfinder.git
cd dg-wayfinder
npm install
cp .env.template .env

# Start local development server on http://localhost:8080
npm run dev
```

Note that you will need to fill in your own DG Catalog API key in your `.env` file in order to use this API.

-------------------------------------------------------------------------------------------------------

## Inputs

Currently, CSV and GeoJSON are the only supported formats. The only allowed input geometries are points. The API supports querying any number of points at once, although the current limit for the Image Catalog API is 5000 queries per day. The 

Allowed variables:
```
Required:
latitude
longitude

Optional - only for /summary endpoint:
date (string)
startDate, endDate (string)
```

The `identifiers` endpoint will return a count of the number of images found for the specified point along with the identifiers for those images.

The `summary` endpoint has three modes of operation, depending on the provided optional inputs. Each mode will query for images that contain the specified point geometry.

1. `date` provided: This will attempt to retrieve any images collected on the specified date and return an array of browse URLs
2. `startDate` and `endDate` provided: Returns a count of the total number of images found within the specified date range
3. Any other/no variables provided: Returns the most recent image found along with its collection date


Both endpoints require an input and output format to be specified as a query string.

Required variables:
```
input - the input data format, either csv or geojson
output - the desired output data format, either csv or geojson
```

Example: `https://<API URL>/identifiers?input=geojson&output=csv`

-------------------------------------------------------------------------------------------------------

## Outputs

### /identifiers

```
count: integer, the total number of images found
identifiers: array of identifier strings (or tab separated string for CSV)
```

### /summary

`date` mode:
```
date - string, identical to the input variable date
images - either an array of browse URL strings (or tab separated string for CSV) or the string 'no results' if no images are found on the specified date
```

`startDate` and `endDate` mode:
```
imageCount - integer, the count of the total number of images collected within the specified range
```

Default mode:
```
latestImage - either a browse URL string or 'no result' if no image was found for the specified point
latestImageAcquired - either a date string in the format 'day month numeric date year hours:minutes:seconds period' or null if no image was found
```

-------------------------------------------------------------------------------------------------------

## Examples

### /identifiers

#### GeoJSON

Input:
```
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          61.0137,
          99.1967
        ]
      }
    }
  ]
}
```

Output:
```
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          61.0137,
          99.1967
        ]
      },
      "properties": {
        "count": 0,
        "identifiers": []
      }
    }
  ]
}
```

#### CSV

Input:
```
latitude, longitude
61.0137, 99.1967
```

Output:
```
latitude, longitude, count, identifiers
61.0137, 99.1967,,
```

### /summary

#### GeoJSON

Input:
```
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -77.036871,
          38.907192
        ]
      },
      "properties": {
        "date": "3/28/2018"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -66.045139,
          18.432127
        ]
      },
      "properties": {
        "startDate": "12/01/2017",
        "endDate": "3/28/2018"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -71.257285,
          42.956753
        ]
      }
    }
  ]
}
```

Output:
```
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -77.036871,
          38.907192
        ]
      },
      "properties": {
        "date": "3/28/2018",
        "images": "no results"
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -66.045139,
          18.432127
        ]
      },
      "properties": {
        "startDate": "12/01/2017",
        "endDate": "3/28/2018",
        "imageCount": 18
      }
    },
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [
          -71.257285,
          42.956753
        ]
      },
      "properties": {
        "latestImage": "https://api.discover.digitalglobe.com/show?id=104001003E184D00",
        "latestImageAcquired": "Thursday May 31st 2018 9:58:54 am"
      }
    }
  ]
}
```

#### CSV

Input:
```
latitude,longitude,date,startDate,endDate
18.432127,-66.045139,,12/01/2017,3/28/2018
38.907192,-77.036871,3/28/2018,,
42.956753,-71.257285,,,
```

Output:
```
latitude,longitude,date,startDate,endDate,images,imageCount,latestImage,latestImageAcquired
18.432127,-66.045139,,12/01/2017,3/28/2018,,18,,
38.907192,-77.036871,3/28/2018,,,no results,,,
42.956753,-71.257285,,,,,,https://api.discover.digitalglobe.com/show?id=104001003E184D00,Thursday May 31st 2018 9:58:54 am
```