import * as params from "@params";

let postsFuse, tagsFuse, categoriesFuse;
let sInput = document.getElementById("searchInput");
let sClear = document.getElementById("searchClear");
let resTags = document.getElementById("resultsTags");
let resCategories = document.getElementById("resultsCategories");
let resPosts = document.getElementById("resultsPosts");
let noResultsOverall = document.getElementById("noResultsOverall");

// Keep original data for rendering
let originalPosts = [];
let originalTags = [];
let originalCategories = [];

function clearAll() {
  resTags.innerHTML = "";
  resCategories.innerHTML = "";
  resPosts.innerHTML = "";
  if (noResultsOverall) noResultsOverall.style.display = "none";
}

function renderNoResults(targetList) {
  targetList.innerHTML = '<li class="no-results">결과가 없습니다.</li>';
}

function buildOptions(defaultKeys) {
  let options = {
    distance: 100,
    threshold: 0.4,
    ignoreLocation: true,
    keys: defaultKeys,
  };
  if (params.fuseOpts) {
    options = {
      isCaseSensitive: params.fuseOpts.iscasesensitive ?? false,
      includeScore: params.fuseOpts.includescore ?? false,
      includeMatches: true,
      minMatchCharLength: params.fuseOpts.minmatchcharlength ?? 1,
      shouldSort: params.fuseOpts.shouldsort ?? true,
      findAllMatches: params.fuseOpts.findallmatches ?? false,
      keys: defaultKeys,
      location: params.fuseOpts.location ?? 0,
      threshold: params.fuseOpts.threshold ?? 0.4,
      distance: params.fuseOpts.distance ?? 100,
      ignoreLocation: params.fuseOpts.ignorelocation ?? true,
    };
  }
  return options;
}

// Remove all whitespaces for loose matching (including newlines)
function removeSpaces(str) {
  return (str || "").replace(/\s+/g, "");
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build regex that matches the term in text allowing arbitrary whitespace between characters
function buildLooseRegexFromTerm(term) {
  if (!term) return null;
  const trimmed = term.trim();
  if (!trimmed) return null;
  const noSpaces = removeSpaces(trimmed);
  if (!noSpaces) return null;
  const parts = [...noSpaces].map((ch) => escapeRegExp(ch));
  const pattern = parts.join("\\s*");
  try {
    return new RegExp(pattern, "gi");
  } catch (_) {
    return null;
  }
}

function highlightWithRegex(text, regex) {
  if (!regex || !text) return text || "";
  let result = "";
  let lastIndex = 0;
  regex.lastIndex = 0;
  let m;
  const ranges = [];
  while ((m = regex.exec(text)) !== null) {
    const start = m.index;
    const end = regex.lastIndex - 1;
    if (start >= lastIndex) {
      ranges.push([start, end]);
      lastIndex = end + 1;
    }
    if (m.index === regex.lastIndex) regex.lastIndex++; // avoid zero-length loops
  }
  if (ranges.length === 0) return text;
  let out = "";
  let prev = 0;
  for (const [s, e] of ranges) {
    out += text.slice(prev, s);
    out += "<mark>" + text.slice(s, e + 1) + "</mark>";
    prev = e + 1;
  }
  out += text.slice(prev);
  return out;
}

window.onload = function () {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        let data = JSON.parse(xhr.responseText);
        if (data) {
          originalPosts = data.posts || [];
          originalTags = data.tags || [];
          originalCategories = data.categories || [];

          // Build normalized datasets (whitespace removed)
          const postsNorm = originalPosts.map((p) => ({
            ...p,
            title_n: removeSpaces(p.title || ""),
            summary_n: removeSpaces(p.summary || ""),
            content_n: removeSpaces(p.content || ""),
          }));
          const tagsNorm = originalTags.map((t) => ({
            ...t,
            name_n: removeSpaces(t.name || ""),
          }));
          const categoriesNorm = originalCategories.map((c) => ({
            ...c,
            name_n: removeSpaces(c.name || ""),
          }));

          const postsOptions = buildOptions(["title_n", "summary_n", "content_n"]);
          const tagOptions = buildOptions(["name_n"]);
          const categoryOptions = buildOptions(["name_n"]);
          postsFuse = new Fuse(postsNorm, postsOptions);
          tagsFuse = new Fuse(tagsNorm, tagOptions);
          categoriesFuse = new Fuse(categoriesNorm, categoryOptions);
        }
      } else {
        console.log(xhr.responseText);
      }
    }
  };
  xhr.open("GET", "../index.json");
  xhr.send();
};

// Navigate when clicking anywhere on a result item
document.addEventListener("click", function (e) {
  const li = e.target && e.target.closest ? e.target.closest("li.post-entry") : null;
  if (li) {
    const a = li.querySelector("a[href]");
    if (a && a.href) {
      window.location.href = a.href;
    }
  }
});

function renderList(items, mapper, targetList) {
  if (!items || items.length === 0) {
    renderNoResults(targetList);
    return 0;
  }
  const html = items.map(mapper).join("");
  targetList.innerHTML = html;
  return items.length;
}

sInput.onkeyup = function () {
  const term = this.value.trim();
  if (sClear) sClear.style.display = term.length ? "block" : "none";
  clearAll();
  if (!term) {
    // When empty term, show per-section empty state and hide overall banner
    renderNoResults(resTags);
    renderNoResults(resCategories);
    renderNoResults(resPosts);
    if (noResultsOverall) noResultsOverall.style.display = "none";
    return;
  }

  let limit = 30;
  if (params.fuseOpts && typeof params.fuseOpts.limit === "number") {
    limit = params.fuseOpts.limit;
  }

  const sanitized = removeSpaces(term);
  if (!sanitized) return;

  const looseRegex = buildLooseRegexFromTerm(term);

  const tagResults = tagsFuse ? tagsFuse.search(sanitized, { limit }) : [];
  const categoryResults = categoriesFuse ? categoriesFuse.search(sanitized, { limit }) : [];
  const postResults = postsFuse ? postsFuse.search(sanitized, { limit }) : [];

  // If nothing matched anywhere, show only the overall message to avoid duplicates
  const total =
    (tagResults?.length || 0) + (categoryResults?.length || 0) + (postResults?.length || 0);
  if (total === 0) {
    if (noResultsOverall) noResultsOverall.style.display = "block";
    return;
  } else if (noResultsOverall) {
    noResultsOverall.style.display = "none";
  }

  function applyHighlights(text, indices) {
    if (!indices || indices.length === 0) return text;
    let result = "";
    let lastIndex = 0;
    indices.sort((a, b) => a[0] - b[0]);
    indices.forEach(([start, end]) => {
      if (start > text.length) return;
      const safeEnd = Math.min(end, text.length - 1);
      result += text.slice(lastIndex, start);
      result += "<mark>" + text.slice(start, safeEnd + 1) + "</mark>";
      lastIndex = safeEnd + 1;
    });
    result += text.slice(lastIndex);
    return result;
  }

  const tagCount = renderList(
    tagResults,
    (r) => {
      // r.item is normalized; find original
      const orig = originalTags.find((t) => removeSpaces(t.name || "") === r.item.name_n) || r.item;
      const name = orig.name || "";
      const highlighted = highlightWithRegex(name, looseRegex);
      return `\n<li class="post-entry"><header class="entry-header"># ${highlighted}</header><a href="${orig.permalink}" aria-label="${name}"></a></li>`;
    },
    resTags
  );
  const categoryCount = renderList(
    categoryResults,
    (r) => {
      const orig =
        originalCategories.find((c) => removeSpaces(c.name || "") === r.item.name_n) || r.item;
      const name = orig.name || "";
      const highlighted = highlightWithRegex(name, looseRegex);
      return `\n<li class="post-entry"><header class="entry-header">${highlighted}</header><a href="${orig.permalink}" aria-label="${name}"></a></li>`;
    },
    resCategories
  );
  const postCount = renderList(
    postResults,
    (r) => {
      const orig =
        originalPosts.find(
          (p) =>
            removeSpaces(p.title || "") === r.item.title_n &&
            removeSpaces(p.permalink || "") === removeSpaces(r.item.permalink || "")
        ) || r.item;
      const title = orig.title || "";
      const titleHl = highlightWithRegex(title, looseRegex);
      let snippet = "";
      const content = orig.content || "";
      const rx = looseRegex;
      if (rx) {
        rx.lastIndex = 0;
        const m = rx.exec(content);
        if (m) {
          const start = m.index;
          const end = rx.lastIndex - 1;
          const s = Math.max(0, start - 40);
          const e = Math.min(content.length, end + 40);
          const slice = content.slice(s, e);
          const sliceHl = highlightWithRegex(slice, buildLooseRegexFromTerm(term));
          snippet = `<div class="entry-content">${s > 0 ? "..." : ""}${sliceHl}${
            e < content.length ? "..." : ""
          }</div>`;
        }
      }
      return `\n<li class="post-entry"><header class="entry-header">${titleHl}&nbsp;»</header>${snippet}<a href="${orig.permalink}" aria-label="${title}"></a></li>`;
    },
    resPosts
  );

  if (noResultsOverall) {
    noResultsOverall.style.display = tagCount + categoryCount + postCount === 0 ? "block" : "none";
  }
};

if (sClear) {
  sClear.addEventListener("click", function () {
    sInput.value = "";
    sClear.style.display = "none";
    // Trigger empty state rendering
    sInput.dispatchEvent(new Event("keyup"));
    sInput.focus();
  });
}
