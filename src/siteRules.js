(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  /**
   * Host-specific rules and configuration.
   *
   * For now, non-Steam handling is left as a placeholder, but this is
   * a good extension point for future support (e.g., GOG, Epic, etc.).
   */
  ns.SITE_RULES = {
    // You can add other host-specific hide rules here
  };
})(window);
