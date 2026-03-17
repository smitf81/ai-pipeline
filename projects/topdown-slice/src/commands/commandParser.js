export function parseCommand(input) {
  const normalized = input.trim().toLowerCase();

  const spawnMatch = normalized.match(/^spawn unit (\w+) at (\d+) (\d+)$/);
  if (spawnMatch) {
    return { ok: true, command: { kind: 'spawn-unit', unitType: spawnMatch[1], x: Number(spawnMatch[2]), y: Number(spawnMatch[3]) } };
  }

  const placeMatch = normalized.match(/^place building (\w+) at (\d+) (\d+)$/);
  if (placeMatch) {
    return { ok: true, command: { kind: 'place-building', buildingType: placeMatch[1], x: Number(placeMatch[2]), y: Number(placeMatch[3]) } };
  }

  const moveMatch = normalized.match(/^move agent to (\d+) (\d+)$/);
  if (moveMatch) {
    return { ok: true, command: { kind: 'move-agent', x: Number(moveMatch[1]), y: Number(moveMatch[2]) } };
  }

  const deleteMatch = normalized.match(/^delete building ([a-z0-9-]+)$/);
  if (deleteMatch) {
    return { ok: true, command: { kind: 'delete-building', id: deleteMatch[1] } };
  }

  return {
    ok: false,
    error: 'Unknown command. Try: spawn unit worker at 5 5 | place building house at 7 4 | move agent to 3 8 | delete building building-001'
  };
}
