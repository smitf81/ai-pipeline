import assert from 'node:assert/strict';
import { createBlankMap, setTile } from '../src/world/mapModel.js';
import { createInitialGameState, advanceGameTick } from '../src/game/gameModel.js';
import { deriveWeatherFields, sampleWeatherFields } from '../src/world/weatherFields.js';

export function run() {
  const map = createBlankMap({ width: 24, height: 16, fill: 'land' });
  for (let y = 0; y < map.height; y += 1) {
    setTile(map, 0, y, 'sea');
    setTile(map, 1, y, 'river');
  }
  for (let x = 12; x < 18; x += 1) {
    for (let y = 4; y < 9; y += 1) {
      setTile(map, x, y, 'mountains');
    }
  }

  const weather = deriveWeatherFields(map, { tick: 0, time: { dayProgress: 0.5 } });
  assert.equal(weather.fields.heat.width, map.width);
  assert.equal(weather.fields.humidity.height, map.height);
  assert.ok(weather.summary.fields.heat.max <= 1);
  assert.ok(weather.summary.fields.humidity.max <= 1);

  const coastal = sampleWeatherFields(weather.fields, 1, 8);
  const inland = sampleWeatherFields(weather.fields, 22, 8);
  assert.ok(coastal.humidity > inland.humidity, 'water-adjacent tiles should be more humid than dry inland tiles');
  assert.ok(inland.heat >= coastal.heat - 0.2, 'inland land should not become dramatically colder than wet coast');

  const game = createInitialGameState(map);
  assert.ok(game.fields.heat, 'game state exposes heat field');
  assert.ok(game.fields.humidity, 'game state exposes humidity field');
  assert.ok(game.fields.cloudCover, 'game state exposes cloud cover field');
  assert.ok(game.fields.rainfall, 'game state exposes rainfall field');
  assert.ok(game.weather?.source === 'weather_spatial_fields');

  const phaseBefore = game.weather.weatherPhase;
  for (let i = 0; i < 4; i += 1) {
    advanceGameTick(game, map);
  }
  assert.equal(game.weather.weatherPhase, phaseBefore, 'weather fields should remain cadenced instead of recomputing every tick');
}
