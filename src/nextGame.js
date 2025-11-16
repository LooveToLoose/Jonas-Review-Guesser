(function (root) {
  const ns = (root.ReviewGuesser = root.ReviewGuesser || {});

  async function getRandomAppId() {
    const response = await fetch("https://store.steampowered.com/explore/random/", {
      redirect: 'follow'
    });
    let pathParts = new URL(response.url).pathname.split("/").filter(entry => entry.trim().length > 0)
    let appId = pathParts.at(-1)
    return appId
  }

  async function navigateToRandomApp() {
    let appid = null;

    appid = await getRandomAppId();

    if (!appid) {
      // Fallback: Dota 2, in case everything fails
      appid = 570;
    }

    window.location.assign(
      `https://store.steampowered.com/app/${appid}/`
    );
  }

  /**
   * Create a "Next Game" button
   * @returns {HTMLAnchorElement}
   */
  function makeNextGameButton(label) {
    const a = document.createElement("a");
    a.className = "btnv6_blue_hoverfade btn_medium ext-next-game";
    a.href = "#";

    const span = document.createElement("span");
    span.textContent = "Next Game";
    a.appendChild(span);

    a.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        navigateToRandomApp();
      },
      { passive: false }
    );

    return a;
  }

  // ---------------------------------------------------------------------------
  // Oops / region-locked page: header button(s)
  // ---------------------------------------------------------------------------

  function installNextGameButtonOnOops() {
    const header = document.querySelector(
      ".page_header_ctn .page_content"
    );
    if (!header) return;

    // Avoid duplicates – if we already placed any ext-next-game, stop.
    if (header.querySelector(".ext-next-game")) return;

    const target =
      header.querySelector("h2.pageheader") || header;

    // Wrap both buttons in a simple row
    const pureBtn = makeNextGameButton("Next Game");

    const row = document.createElement("div");
    row.style.marginTop = "10px";
    row.style.display = "flex";
    row.style.gap = "8px";
    row.appendChild(pureBtn);

    if (target && target.parentElement) {
      target.insertAdjacentElement("afterend", row);
    } else {
      header.appendChild(row);
    }
  }

  // ---------------------------------------------------------------------------
  // Normal app page: replace Community Hub with two buttons
  // ---------------------------------------------------------------------------

  function installNextGameButton() {
    const container = document.querySelector(
      ".apphub_HomeHeaderContent .apphub_OtherSiteInfo"
    );
    if (!container) return;

    // Avoid duplicates
    if (container.querySelector(".ext-next-game")) return;

    // Remove the original Community Hub button, if present
    const hubBtn = container.querySelector(
      "a.btnv6_blue_hoverfade.btn_medium"
    );
    if (hubBtn) hubBtn.remove();

    const pureBtn = makeNextGameButton();

    // Let Steam's layout handle positioning; just drop them in order
    container.appendChild(pureBtn);
  }

  ns.installNextGameButtonOnOops = installNextGameButtonOnOops;
  ns.installNextGameButton = installNextGameButton;
})(window);
