# Data Files

## Required Files
This extension requires the following data files to enable tag filtering:

- `tags_index.json` - Tag to app ID mappings
- `available_tags.json` - List of all available tags  
- `released_appids.csv` - List of all Steam app IDs
- `Batch_1.csv` through `Batch_6.csv` - Curated game batches

## How to Generate

If the data files are missing, you need to:

1. **Download the Steam games dataset** from Kaggle:
   - Dataset: [FronkonGames Steam Games Dataset](https://www.kaggle.com/datasets/fronkongames/steam-games-dataset)
   - Download the JSON file and save as `games.json` in project root

2. **Install dependencies**:
```bash
   npm install stream-json
```

3. **Run the data processing script**:
```bash
   node process_steam_data_stream.js
```

This will generate the required JSON and CSV files in the `data/` folder.

## File Sizes (Approximate)
- `games.json` - ~150MB (do not commit)
- `tags_index.json` - ~5-10MB
- `available_tags.json` - ~10KB
- Other CSV files - varies