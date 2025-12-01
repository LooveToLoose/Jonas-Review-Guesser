// process_steam_data_stream.js
const fs = require('fs');
const { parser } = require('stream-json');
const { streamObject } = require('stream-json/streamers/StreamObject');

console.log('Loading Steam data (stream parser)...');

const tagIndex = {};
const allAppIds = [];
let gameCount = 0;

const pipeline = fs.createReadStream('games.json')
  .pipe(parser())
  .pipe(streamObject());

pipeline.on('data', ({ key, value }) => {
  // key = app ID (e.g., "20200")
  // value = game object
  
  const appId = key;
  const gameData = value;
  
  const numericAppId = parseInt(appId);
  allAppIds.push(numericAppId);
  
  // Process tags
  const tags = gameData.tags || {};
  for (const tagName of Object.keys(tags)) {
    if (!tagIndex[tagName]) {
      tagIndex[tagName] = [];
    }
    tagIndex[tagName].push(numericAppId);
  }
  
  gameCount++;
  if (gameCount % 10000 === 0) {
    console.log(`Processed ${gameCount} games...`);
  }
});

pipeline.on('end', () => {
  console.log(`\nProcessed ${gameCount} games`);
  console.log(`Found ${Object.keys(tagIndex).length} unique tags`);
  
  // Create data directory if needed
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }
  
  // Save files
  fs.writeFileSync('data/tags_index.json', JSON.stringify(tagIndex));
  console.log('✓ Saved data/tags_index.json');
  
  const availableTags = Object.keys(tagIndex).sort();
  fs.writeFileSync('data/available_tags.json', JSON.stringify(availableTags));
  console.log('✓ Saved data/available_tags.json');
  
  // Sort app IDs before saving
  allAppIds.sort((a, b) => a - b);

  const appIdsCsv = allAppIds.join('\n');
  fs.writeFileSync('data/released_appids.csv', appIdsCsv);
  console.log('✓ Saved data/released_appids.csv');
  
  // Statistics
  console.log('\n📊 Statistics:');
  console.log(`Total games: ${allAppIds.length}`);
  console.log(`Total tags: ${availableTags.length}`);
  
  const tagCounts = Object.entries(tagIndex)
    .map(([tag, appIds]) => ({ tag, count: appIds.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
  
  console.log('\n🏷️  Top 20 most common tags:');
  tagCounts.forEach(({ tag, count }) => {
    console.log(`  ${tag}: ${count} games`);
  });
  
  
  console.log('\n✅ Done!');
});

pipeline.on('error', (error) => {
  console.error('Error:', error);
});