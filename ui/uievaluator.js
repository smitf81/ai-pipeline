function evaluateDelta(previous = {}, current = {}) {
    const result = {
      score: 0,
      changes: [],
    };
  
    // Example signals (keep it simple)
    const prevBlocked = Boolean(previous.blocked);
    const currBlocked = Boolean(current.blocked);
  
    if (prevBlocked && !currBlocked) {
      result.score += 1;
      result.changes.push('blocker_resolved');
    }
  
    if (!prevBlocked && currBlocked) {
      result.score -= 1;
      result.changes.push('new_blocker_introduced');
    }
  
    const prevConfidence = Number(previous.system_confidence || 0);
    const currConfidence = Number(current.system_confidence || 0);
  
    const delta = currConfidence - prevConfidence;
  
    if (delta > 0) {
      result.score += delta;
      result.changes.push('confidence_up');
    }
  
    if (delta < 0) {
      result.score += delta;
      result.changes.push('confidence_down');
    }
  
    return result;
  }
  
  module.exports = {
    evaluateDelta,
  };