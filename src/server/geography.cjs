const countries=require('./geography/world.json');
const byKey=new Map(countries.map(c=>[c.key,c]));
function countryFor(key){return byKey.get(key);}
function geography(country){return country?countryFor(country):countries.map(({locations,...c})=>c);}
module.exports={countryFor,geography};
