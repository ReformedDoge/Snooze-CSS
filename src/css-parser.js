// Lossless CSS Parser

export function parseCssToNodes(css) {
  const nodes = [];
  let i = 0;
  let buffer = "";
  let inComment = false;
  let inString = false;
  let stringChar = "";
  let depth = 0;

  function flushBuffer(type) {
    const content = buffer.trim();
    if (!content) return;
    
    if (type === "rule") {
      const braceIdx = content.indexOf("{");
      if (braceIdx !== -1) {
        const selector = content.substring(0, braceIdx).trim();
        const body = content.substring(braceIdx + 1).replace(/\}$/, "").trim();
        const props = {};
        body.split(";").forEach(line => {
          const colon = line.indexOf(":");
          if (colon !== -1) {
            const k = line.substring(0, colon).trim();
            const v = line.substring(colon + 1).trim();
            if (k) props[k] = v;
          }
        });
        nodes.push({ type: "rule", selector, props });
      }
    } else {
      nodes.push({ type, content });
    }
    buffer = "";
  }

  while (i < css.length) {
    const char = css[i];
    const nextChar = css[i + 1];

    // Comments
    if (!inString && !inComment && char === "/" && nextChar === "*") {
      flushBuffer("rule"); 
      inComment = true;
      buffer = "/ *"; // Space to prevent immediate close on next i iteration if we weren't careful
      buffer = "/*";
      i += 2;
      continue;
    }
    if (inComment && char === "*" && nextChar === "/") {
      buffer += "*/";
      flushBuffer("comment");
      inComment = false;
      i += 2;
      continue;
    }

    if (inComment) {
      buffer += char;
      i++;
      continue;
    }

    // Strings
    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      buffer += char;
      i++;
      continue;
    }
    if (inString && char === stringChar && css[i-1] !== "\\") {
      inString = false;
      buffer += char;
      i++;
      continue;
    }

    if (inString) {
      buffer += char;
      i++;
      continue;
    }

    // Braces (Rule depth)
    if (char === "{") {
      depth++;
      buffer += char;
    } else if (char === "}") {
      depth--;
      buffer += char;
      if (depth === 0) {
        flushBuffer("rule");
      }
    } else if (depth === 0 && char === "@") {
      // Find end of at-rule (either ; or {)
      let j = i;
      let hasBraces = false;
      while (j < css.length) {
        if (css[j] === ";") break;
        if (css[j] === "{") { hasBraces = true; break; }
        j++;
      }
      
      if (hasBraces) {
        // Find matching }
        let d = 0;
        while (j < css.length) {
          if (css[j] === "{") d++;
          if (css[j] === "}") d--;
          j++;
          if (d === 0) break;
        }
        buffer = css.substring(i, j);
        nodes.push({ type: "at-rule", content: buffer.trim() });
        buffer = "";
        i = j;
        continue;
      } else {
        buffer = css.substring(i, j + 1);
        nodes.push({ type: "at-rule", content: buffer.trim() });
        buffer = "";
        i = j + 1;
        continue;
      }
    } else {
      buffer += char;
    }
    i++;
  }

  // Final flush for trailing comments or text
  if (buffer.trim()) {
    if (buffer.trim().startsWith("/*")) flushBuffer("comment");
    else flushBuffer("rule");
  }

  return nodes;
}

export function serializeNodesToCss(nodes) {
  let css = "";
  nodes.forEach(node => {
    if (node.type === "comment") {
      // Add newline before markers for readability
      if (node.content.includes("===")) css += "\n";
      css += node.content + "\n";
    } else if (node.type === "at-rule") {
      css += node.content + "\n";
    } else if (node.type === "rule") {
      css += `\n${node.selector} {\n`;
      for (const [k, v] of Object.entries(node.props)) {
        css += `\t${k}: ${v};\n`;
      }
      css += "}\n";
    }
  });

  // Clean up excessive newlines
  return css.trim().replace(/\n{3,}/g, "\n\n") + "\n";
}

// Surgical property update
export function updateCssString(css, selector, propsObj) {
  const nodes = parseCssToNodes(css);
  let foundNode = null;

  // Find an existing rule that matches the selector.
  // The selectorMatches helper handles comma-separated lists correctly.
  for (const node of nodes) {
    if (node.type === "rule" && selectorMatches(node.selector, selector)) {
      foundNode = node;
      break;
    }
  }

  if (foundNode) {
    // If a rule exists, update its properties.
    for (const [prop, val] of Object.entries(propsObj)) {
      // If the value is null, undefined, or an empty string, we remove the property.
      if (val === null || val === undefined || String(val).trim() === "") {
        delete foundNode.props[prop];
      } else {
        foundNode.props[prop] = String(val);
      }
    }
  } else {
    // If no rule was found, filter out any empty props and create a new rule node.
    const newProps = {};
    for (const [prop, val] of Object.entries(propsObj)) {
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        newProps[prop] = String(val);
      }
    }
    // Only add the new rule if it actually has properties.
    if (Object.keys(newProps).length > 0) {
      nodes.push({ type: "rule", selector, props: newProps });
    }
  }

  // Serialize the modified node tree back into a formatted CSS string.
  return serializeNodesToCss(nodes);
}


function selectorMatches(currentSelector, target) {
  if (currentSelector === target) return true;
  return currentSelector.split(",").map(s => s.trim()).includes(target);
}

// LEGACY COMPAT
export function parseCssToMap(css) {
  const map = new Map();
  const nodes = parseCssToNodes(css);
  nodes.forEach(n => {
    if (n.type === "rule") map.set(n.selector, n.props);
  });
  return map;
}

export function serializeMapToCss(map) {
  const nodes = [];
  map.forEach((props, selector) => nodes.push({ type: "rule", selector, props }));
  return serializeNodesToCss(nodes);
}
