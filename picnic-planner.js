const https = require('https');
const moment = require('moment');

const weatherStatusRank = ['Heavy Cloud', 'Light Cloud', 'Clear'];
const temperatureRank = [[10, 35], [15, 30], [20, 25]];
const windSpeedRank = [[0, 31], [4, 24], [8, 18]];

const decidingFactors = {
    bothDaysNotFriendly: 0,
    onlyOneDayFriendly: 1,
    weather: 2,
    temperature: 3,
    wind: 4,
    bothDaysFriendly: 5
};

const literals = {
    0: () => {
        return `The weather isn’t looking very good this weekend, maybe stay indoors.`;
    },
    1: (weekday) => {
        return `You should have your picnic on ${weekday}`;
    },
    2: (weekday) => {
        return `This weekend looks nice for a picnic, ${weekday} is best because it’s going to be clearer.`;
    },
    3: (weekday) => {
        return `This weekend looks nice for a picnic, ${weekday} is best because the temperature is going to be as close to the sweetspot as it gets.`;
    },
    4: (weekday) => {
        return `This weekend looks nice for a picnic, ${weekday} is best because it appears to have a nicer breeze to it.`;
    },
    5: () => {
        return `Having accounted for everything, it really seems like both Saturday and Sunday are just fine for a picnic.`;
    }
};

let cityName = process.argv[2];
let today = moment().isoWeekday();
let weekdaysToForecast = [6, 7];
let hasWeekendStarted = today >= weekdaysToForecast[0];
let weekOffset = hasWeekendStarted ? 7 : 0;
let datesToForecast = weekdaysToForecast.map((weekday) => {
    return moment().add(weekOffset + weekday - today, 'days').format('YYYY/M/DD');
});

function getLocationId(locationSearchQuery) {
    return new Promise((resolve, reject) => {
        https.get(`https://www.metaweather.com/api/location/search/?query=${encodeURI(locationSearchQuery)}`, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            })

            response.on('end', () => {
                let dataArr = JSON.parse(data);
                
                if(dataArr.length === 1) {
                    resolve(dataArr[0].woeid);
                } else if(dataArr.length > 1){
                    reject('Two or more locations match this search criteria.');
                } else {
                    reject('Could not find location data.')
                }
            });
        }).on('error', (err) => {
            reject(err);
        })
    });
};

function getForecastForLocation(locationId, dateArr) {
    let promiseArr = dateArr.map((date) => {
        return new Promise((resolve, reject) => {
            https.get(`https://www.metaweather.com/api/location/${locationId}/${date}/`, (response) => {
                let data = '';
    
                response.on('data', (chunk) => {
                    data += chunk;
                })
    
                response.on('end', () => {
                    resolve(data);
                });
            }).on('error', (err) => {
                reject(err);
            })
        });
    });

    return Promise.all(promiseArr);
};

function parseForecastData(dataArr) {
    return dataArr.map((data) => {
        let jsonData = JSON.parse(data);
        let latestForecast = jsonData[0];
        
        return latestForecast;
    });
};

function rankDays(dataArr) {
    dataArr.forEach((forecast) => {
        forecast.weatherStatusRank = weatherStatusRank.indexOf(forecast.weather_state_name);

        forecast.temperatureRank = -1;
        forecast.windSpeedRank = -1;

        for(let i = temperatureRank.length - 1; i > 0; i -= 1) {
            let tempRange = temperatureRank[i];

            if(tempRange[0] <= forecast.the_temp && tempRange[1] >= forecast.the_temp) {
                forecast.temperatureRank = i;
                break;
            }
        }

        for(let i = windSpeedRank.length - 1; i > 0; i -= 1) {
            let windRange = windSpeedRank[i];

            if(windRange[0] <= forecast.wind_speed && windRange[1] >= forecast.wind_speed) {
                forecast.windSpeedRank = i;
                break;
            }
        }

        forecast.isAcceptableForPicnic = !(forecast.the_temp < 10 || forecast.weatherStatusRank === -1);
    });
};

function makeDecision(dataArr) {
    let decidingFactor = decidingFactors.bothDaysNotFriendly

    dataArr.sort((a, b) => {
        if(a.isAcceptableForPicnic && !b.isAcceptableForPicnic) {
            decidingFactor = decidingFactors.onlyOneDayFriendly;
            return -1;
        }

        if(!a.isAcceptableForPicnic && b.isAcceptableForPicnic) {
            decidingFactor = decidingFactors.onlyOneDayFriendly;
            return 1;
        }

        if(a.isAcceptableForPicnic && b.isAcceptableForPicnic) {
            if(a.weatherStatusRank !== b.weatherStatusRank) {
                decidingFactor = decidingFactors.weather;
                return b.weatherStatusRank - a.weatherStatusRank;
            }
    
            if(a.temperatureRank !== b.temperatureRank) {
                decidingFactor = decidingFactors.temperature;
                return b.temperatureRank - a.temperatureRank;
            }
    
            if(a.windSpeedRank !== b.windSpeedRank) {
                decidingFactor = decidingFactors.wind;
                return b.windSpeedRank - a.windSpeedRank;
            }

            decidingFactor = decidingFactors.bothDaysFriendly;
        }

        return 0;
    });

    let selectedDate = moment(dataArr[0].applicable_date);
    let selectedWeekday = selectedDate.format('dddd');
    
    return {
        weekday: selectedWeekday,
        reason: decidingFactor
    };
};

getLocationId(cityName)
.then((locationId) => getForecastForLocation(locationId, datesToForecast))
.then((data) => {
    let forecasts = parseForecastData(data);
    rankDays(forecasts);
    
    let result = makeDecision(forecasts);
    console.log(literals[result.reason](result.weekday));
}).catch((err) => {
    console.log(err);
})
