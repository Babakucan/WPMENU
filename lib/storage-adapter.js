function createJsonStorageAdapter(deps) {
  const {
    loadOrders,
    saveOrders,
    loadFavorites,
    saveFavorites,
    loadPrefs,
    savePrefs,
    loadFeedback,
    saveFeedback
  } = deps;

  return {
    getOrders: () => loadOrders(),
    setOrders: (orders) => saveOrders(orders),
    getFavorites: () => loadFavorites(),
    setFavorites: (favorites) => saveFavorites(favorites),
    getPrefs: () => loadPrefs(),
    setPrefs: (prefs) => savePrefs(prefs),
    getFeedback: () => loadFeedback(),
    setFeedback: (feedback) => saveFeedback(feedback)
  };
}

module.exports = { createJsonStorageAdapter };
