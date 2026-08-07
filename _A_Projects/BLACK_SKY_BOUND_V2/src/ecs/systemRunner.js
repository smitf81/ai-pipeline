export function runSystems(systems, context) {
  for (const system of systems) system(context);
}
