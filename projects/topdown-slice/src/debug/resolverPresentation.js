import { createTileAddress, getTileKey, sameTileAddress } from '../world/coordinates.js';

export const RESOLVER_PRESENTATION_LIMIT = 3;
export const RESOLVER_PULSE_DURATION_FRAMES = 18;

export function createResolverDecisionSnapshot() {
  return {
    cycle: 0,
    frame: 0,
    winnerTile: null,
    entries: []
  };
}

export function buildResolverDecisionSnapshot({
  cycle = 0,
  frame = 0,
  topRanked = [],
  winnerCandidate = null
}) {
  const winnerTile = cloneTile(winnerCandidate?.target);

  return {
    cycle,
    frame,
    winnerTile,
    entries: topRanked
      .slice(0, RESOLVER_PRESENTATION_LIMIT)
      .map((diagnostic) => toResolverPresentationEntry(diagnostic, winnerTile))
  };
}

export function getResolverPresentationEntries(snapshot, topRanked = []) {
  if (snapshot?.entries?.length) {
    return snapshot.entries;
  }

  return topRanked
    .slice(0, RESOLVER_PRESENTATION_LIMIT)
    .map((diagnostic) => toResolverPresentationEntry(diagnostic, null));
}

export function findResolverPresentationEntry(snapshot, tile) {
  if (!snapshot?.entries?.length || !tile) {
    return null;
  }

  const tileKey = getTileKey(tile);
  return snapshot.entries.find((entry) => getTileKey(entry.target) === tileKey) ?? null;
}

export function sameTile(left, right) {
  return sameTileAddress(left, right);
}

export function toResolverPresentationEntry(diagnostic, winnerTile = null) {
  const status = getResolverPresentationStatus(diagnostic, winnerTile);
  const isCycleWinner = sameTile(diagnostic?.target, winnerTile);

  return {
    target: cloneTile(diagnostic.target),
    rank: diagnostic.rank ?? null,
    finalScore: Number(diagnostic.finalScore ?? 0),
    gradient: Number(diagnostic.gradient ?? 0),
    coverDelta: Number(diagnostic.coverDelta ?? 0),
    visibilityDelta: Number(diagnostic.visibilityDelta ?? 0),
    traversalCost: Number(diagnostic.traversalCost ?? 0),
    selectionStatus: diagnostic.selectionStatus ?? 'rejected',
    rejectionCategory: diagnostic.rejectionCategory ?? null,
    rejectionReason: diagnostic.rejectionReason ?? null,
    tieGroupSize: diagnostic.tieGroupSize ?? 1,
    tieBreakReason: diagnostic.tieBreakReason ?? 'Unique final score.',
    isCycleWinner,
    presentationStatus: status,
    badges: buildBadges(status, diagnostic)
  };
}

function getResolverPresentationStatus(diagnostic, winnerTile) {
  if (sameTile(diagnostic?.target, winnerTile)) {
    return 'accepted';
  }

  if (diagnostic?.rejectionReason || diagnostic?.rejectionCategory || diagnostic?.selectionStatus === 'rejected') {
    return 'rejected';
  }

  if (!winnerTile && Number(diagnostic?.rank) === 1) {
    return 'accepted';
  }

  return 'shortlisted';
}

function buildBadges(status, diagnostic) {
  const badges = [status];
  if (Number(diagnostic?.tieGroupSize ?? 1) > 1) {
    badges.push('tie');
  }
  return badges;
}

function cloneTile(tile) {
  return tile ? createTileAddress(tile) : null;
}
