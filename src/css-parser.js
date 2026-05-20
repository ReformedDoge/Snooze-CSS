export function parseCssToNodes(css) {
  const nodes = [];
  let i = 0;
  
  function skipWhitespaceAndComments() {
    while (i < css.length) {
      const c = css[i];
      if (c === '/' && css[i + 1] === '*') {
        let end = css.indexOf('*/', i + 2);
        if (end === -1) end = css.length;
        else end += 2;
        nodes.push({ type: 'comment', content: css.slice(i, end) });
        i = end;
      } else if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        i++;
      } else {
        break;
      }
    }
  }

  function readString() {
    let quote = css[i];
    let start = i;
    i++;
    while (i < css.length) {
      if (css[i] === '\\') {
        i += 2;
        continue;
      }
      if (css[i] === quote) {
        i++;
        break;
      }
      i++;
    }
    return css.slice(start, i);
  }

  function readBlock() {
    let start = i;
    let depth = 0;
    while (i < css.length) {
      if (css[i] === '/' && css[i + 1] === '*') {
        let end = css.indexOf('*/', i + 2);
        i = end === -1 ? css.length : end + 2;
        continue;
      }
      if (css[i] === '"' || css[i] === "'") {
        readString();
        continue;
      }
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
      i++;
    }
    return css.slice(start, i);
  }

  while (i < css.length) {
    skipWhitespaceAndComments();
    if (i >= css.length) break;

    if (css[i] === '@') {
      let start = i;
      while (i < css.length) {
        if (css[i] === '/' && css[i + 1] === '*') {
           let end = css.indexOf('*/', i + 2);
           i = end === -1 ? css.length : end + 2;
           continue;
        }
        if (css[i] === '"' || css[i] === "'") {
          readString();
          continue;
        }
        if (css[i] === ';') {
          i++;
          break;
        }
        if (css[i] === '{') {
          readBlock();
          break;
        }
        i++;
      }
      nodes.push({ type: 'at-rule', content: css.slice(start, i).trim() });
    } else {
      let start = i;
      let hasBlock = false;
      while (i < css.length) {
        if (css[i] === '/' && css[i + 1] === '*') {
           let end = css.indexOf('*/', i + 2);
           i = end === -1 ? css.length : end + 2;
           continue;
        }
        if (css[i] === '"' || css[i] === "'") {
          readString();
          continue;
        }
        if (css[i] === '{') {
          hasBlock = true;
          readBlock();
          break;
        }
        i++;
      }
      if (hasBlock) {
        let ruleContent = css.slice(start, i).trim();
        let braceIdx = ruleContent.indexOf('{');
        let selector = ruleContent.slice(0, braceIdx).trim();
        let bodyContent = ruleContent.slice(braceIdx + 1, -1).trim();
        
        // Parse properties cleanly
        let props = {};
        let j = 0;
        let pStart = 0;
        while (j < bodyContent.length) {
          if (bodyContent[j] === '/' && bodyContent[j + 1] === '*') {
             let end = bodyContent.indexOf('*/', j + 2);
             j = end === -1 ? bodyContent.length : end + 2;
             continue;
          }
          if (bodyContent[j] === '"' || bodyContent[j] === "'") {
             let quote = bodyContent[j];
             j++;
             while(j < bodyContent.length && bodyContent[j] !== quote) {
                if (bodyContent[j] === '\\') j++;
                j++;
             }
             j++;
             continue;
          }
          // nested block skipping to prevent node.props corruption
          if (bodyContent[j] === '{') {
             let depth = 1;
             j++;
             while (j < bodyContent.length) {
                if (bodyContent[j] === '"' || bodyContent[j] === "'") {
                   let quote = bodyContent[j];
                   j++;
                   while (j < bodyContent.length && bodyContent[j] !== quote) {
                      if (bodyContent[j] === '\\') j++;
                      j++;
                   }
                } else if (bodyContent[j] === '{') {
                   depth++;
                } else if (bodyContent[j] === '}') {
                   depth--;
                   if (depth === 0) {
                      break;
                   }
                }
                j++;
             }
             pStart = j + 1;
             j++;
             continue;
          }
          if (bodyContent[j] === ';') {
            let decl = bodyContent.slice(pStart, j).trim();
            if (decl) {
               let colonIdx = decl.indexOf(':');
               if (colonIdx !== -1) {
                  let k = decl.slice(0, colonIdx).trim();
                  let v = decl.slice(colonIdx + 1).trim();
                  if (k) props[k] = v;
               }
            }
            pStart = j + 1;
          }
          j++;
        }
        let lastDecl = bodyContent.slice(pStart).trim();
        if (lastDecl) {
            let colonIdx = lastDecl.indexOf(':');
            if (colonIdx !== -1) {
              let k = lastDecl.slice(0, colonIdx).trim();
              let v = lastDecl.slice(colonIdx + 1).trim();
              if (k) props[k] = v;
            }
        }
        nodes.push({ type: 'rule', selector, props, rawBody: bodyContent });
      } else {
        nodes.push({ type: 'text', content: css.slice(start, i).trim() });
      }
    }
  }
  return nodes;
}

export function serializeNodesToCss(nodes) {
  let css = "";
  nodes.forEach((node) => {
    if (node.type === "comment") {
      if (node.content.includes("===")) css += "\n";
      css += node.content + "\n";
    } else if (node.type === "at-rule") {
      css += node.content + "\n";
    } else if (node.type === "rule") {
      css += `\n${node.selector} {\n`;
      if (node.rawBody) {
        let body = node.rawBody;
        if (node.isModified) {
          // Modify only updated properties in rawBody, 
          // leaving nested rules and comments untouched
          for (const [k, v] of Object.entries(node.props)) {
            // Check if property already exists in the top-level of the body
            const escapedK = k.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            const propRegex = new RegExp(`(^|;|\\s)(\\s*)${escapedK}\\s*:[^;}]*(;|$)`, 'g');
            if (propRegex.test(body)) {
              propRegex.lastIndex = 0;
              if (v === null || v === undefined || v.trim() === "") {
                body = body.replace(propRegex, '$1'); // Remove
              } else {
                body = body.replace(propRegex, `$1$2${k}: ${v}$3`); // Update inline, preserving indentation
              }
            } else if (v !== null && v !== undefined && v.trim() !== "") {
              // Append new property to the top-level (before any nested rules)
              // Safe append so it doesn't break bracket bounds
              const firstBrace = body.indexOf('{');
              if (firstBrace !== -1) {
                const preBrace = body.substring(0, firstBrace).trimEnd();
                body = preBrace + (preBrace.endsWith(';') ? '' : ';') + `\n\t${k}: ${v};\n\t` + body.substring(firstBrace);
              } else {
                body = (body.trimEnd() ? body.trimEnd() + ";\n\t" : "\t") + `${k}: ${v};`;
              }
            }
          }
        }
        
        // first line of the body has proper indentation if missing
        if (body && !body.startsWith("\t") && !body.startsWith(" ")) {
          body = "\t" + body;
        }
        css += body + "\n";
      } else {
        for (const [k, v] of Object.entries(node.props)) {
          css += `\t${k}: ${v};\n`;
        }
      }
      css += "}\n";
    } else if (node.type === "text" && node.content) {
      css += node.content + "\n";
    }
  });
  return css.trim().replace(/\n{3,}/g, "\n\n") + "\n";
}

export function updateCssString(css, selector, propsObj) {
  const nodes = parseCssToNodes(css);
  let foundNode = null;

  for (const node of nodes) {
    if (node.type === "rule" && selectorMatches(node.selector, selector)) {
      foundNode = node;
      break;
    }
  }

  if (foundNode) {
    foundNode.isModified = true;
    for (const [prop, val] of Object.entries(propsObj)) {
      if (val === null || val === undefined || String(val).trim() === "") {
        delete foundNode.props[prop];
      } else {
        foundNode.props[prop] = String(val);
      }
    }
  } else {
    const newProps = {};
    for (const [prop, val] of Object.entries(propsObj)) {
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        newProps[prop] = String(val);
      }
    }
    if (Object.keys(newProps).length > 0) {
      nodes.push({ type: "rule", selector, props: newProps });
    }
  }
  return serializeNodesToCss(nodes);
}

function selectorMatches(currentSelector, target) {
  if (currentSelector === target) return true;
  const regex = new RegExp(`(?:^|,)\\s*${target.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*(?:,|$)`);
  return regex.test(currentSelector);
}

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

export function flattenCSS(css) {
  let result = "";
  let i = 0;

  function skipWhitespaceAndComments() {
    while (i < css.length) {
      const c = css[i];
      if (c === '/' && css[i + 1] === '*') {
        let end = css.indexOf('*/', i + 2);
        if (end === -1) end = css.length;
        else end += 2;
        i = end;
      } else if (c === ' ' || c === '\n' || c === '\t' || c === '\r') {
        i++;
      } else {
        break;
      }
    }
  }

  function readString() {
    let quote = css[i];
    let start = i;
    i++;
    while (i < css.length) {
      if (css[i] === '\\') {
        i += 2;
        continue;
      }
      if (css[i] === quote) {
        i++;
        break;
      }
      i++;
    }
    return css.slice(start, i);
  }

  function parseBlock(parentSelectors, inMedia) {
    let properties = [];
    let nested = [];

    while (i < css.length) {
      skipWhitespaceAndComments();
      if (i >= css.length || css[i] === '}') {
        if (css[i] === '}') i++;
        break;
      }

      // Read a statement (property or nested rule)
      let start = i;
      let hasBlock = false;
      while (i < css.length) {
        if (css[i] === '/' && css[i + 1] === '*') {
          let end = css.indexOf('*/', i + 2);
          i = end === -1 ? css.length : end + 2;
          continue;
        }
        if (css[i] === '"' || css[i] === "'") {
          readString();
          continue;
        }
        if (css[i] === ';') {
          i++;
          break;
        }
        if (css[i] === '{') {
          hasBlock = true;
          i++;
          break;
        }
        if (css[i] === '}') {
          break;
        }
        i++;
      }

      let statement = css.slice(start, hasBlock ? i - 1 : i).trim();

      if (hasBlock) {
        if (statement.startsWith('@')) {
           let inner = parseBlock(parentSelectors, statement);
           nested.push({ type: 'at-rule', rule: statement, inner });
        } else {
          // Resolve selectors
          let childSelectors = statement.split(',').map(s => s.trim());
          let resolvedSelectors = [];
          if (parentSelectors.length === 0) {
            resolvedSelectors = childSelectors;
          } else {
            for (let p of parentSelectors) {
              for (let c of childSelectors) {
                if (c.includes('&')) {
                  resolvedSelectors.push(c.split('&').join(p));
                } else {
                  resolvedSelectors.push(p + " " + c);
                }
              }
            }
          }
          nested.push(...parseBlock(resolvedSelectors, inMedia));
        }
      } else {
        if (statement && !statement.startsWith('@')) {
           if (statement.endsWith(';')) statement = statement.slice(0, -1);
           properties.push(statement.trim());
        }
      }

      if (parentSelectors.length === 0) {
        break;
      }
    }

    let nodes = [];
    if (properties.length > 0 && parentSelectors.length > 0) {
      nodes.push({ selectors: parentSelectors, props: properties, media: inMedia });
    }
    nodes.push(...nested);
    return nodes;
  }

  let topLevel = [];
  while (i < css.length) {
    skipWhitespaceAndComments();
    if (i >= css.length) break;

    if (css[i] === '@') {
      let start = i;
      let hasBlock = false;
      while (i < css.length) {
        if (css[i] === '/' && css[i + 1] === '*') {
           let end = css.indexOf('*/', i + 2);
           i = end === -1 ? css.length : end + 2;
           continue;
        }
        if (css[i] === '"' || css[i] === "'") {
          readString();
          continue;
        }
        if (css[i] === ';') {
          i++;
          break;
        }
        if (css[i] === '{') {
          hasBlock = true;
          i++;
          break;
        }
        i++;
      }
      
      let statement = css.slice(start, hasBlock ? i - 1 : i).trim();
      if (hasBlock) {
        const isGroupingRule = statement.startsWith('@media') || statement.startsWith('@supports');
        if (isGroupingRule) {
          let inner = parseBlock([], statement);
          topLevel.push(...inner);
        } else {
          // It's a flat block like @font-face or @keyframes.
          let inner = parseBlock([statement], null);
          topLevel.push(...inner);
        }
      } else {
        // Slice off trailing semicolon on flat at-rules to prevent double semicolons
        if (statement.endsWith(';')) statement = statement.slice(0, -1);
        result += statement + ";\n";
      }
    } else {
       topLevel.push(...parseBlock([], null));
    }
  }

  // Serialize flat
  let groupedByMedia = {};
  for (let node of topLevel) {
    if (node.type === 'at-rule') {
        // Nested at-rule nodes are structured separately
    } else {
       let media = node.media || "all";
       if (!groupedByMedia[media]) groupedByMedia[media] = [];
       groupedByMedia[media].push(node);
    }
  }

  for (let [media, nodes] of Object.entries(groupedByMedia)) {
    let mediaStr = "";
    if (media !== "all") {
       mediaStr += media + " {\n";
    }
    for (let node of nodes) {
      let sel = node.selectors.join(", ");
      let props = node.props.join(";\n  ") + ";";
      if (media !== "all") {
         mediaStr += "  " + sel + " {\n    " + props + "\n  }\n";
      } else {
         result += sel + " {\n  " + props + "\n}\n";
      }
    }
    if (media !== "all") {
       result += mediaStr + "}\n";
    }
  }

  return result;
}


export function beautifyCSS(cssText) {
  let resultParts = [];
  let indent = 0;
  let i = 0;
  let inString = false;
  let strChar = "";
  let inComment = false;
  let buffer = "";
  let lastCharWasSpace = false;

  function getIndent() {
    return "\t".repeat(indent);
  }

  while (i < cssText.length) {
    let char = cssText[i];
    let nextChar = cssText[i + 1];

    if (!inString && !inComment && char === "/" && nextChar === "*") {
      inComment = true;
      buffer += "/*";
      i += 2;
      lastCharWasSpace = false;
      continue;
    }
    if (inComment && char === "*" && nextChar === "/") {
      inComment = false;
      buffer += "*/";
      i += 2;
      lastCharWasSpace = false;
      continue;
    }
    if (inComment) {
      buffer += char;
      i++;
      lastCharWasSpace = false;
      continue;
    }

    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      strChar = char;
      buffer += char;
      i++;
      lastCharWasSpace = false;
      continue;
    }
    if (inString && char === strChar && cssText[i - 1] !== "\\") {
      inString = false;
      buffer += char;
      i++;
      lastCharWasSpace = false;
      continue;
    }
    if (inString) {
      buffer += char;
      i++;
      lastCharWasSpace = false;
      continue;
    }

    if (char === "{") {
      const trimmed = buffer.trim();
      
      if (indent === 0 && resultParts.length > 0) {
        resultParts.push("\n");
      }

      resultParts.push(getIndent() + (trimmed ? trimmed + " {" : "{") + "\n");
      buffer = "";
      indent++;
      i++;
      lastCharWasSpace = false;
      continue;
    }
    if (char === "}") {
      if (buffer.trim()) {
        resultParts.push(getIndent() + buffer.trim() + "\n");
      }
      buffer = "";
      indent = Math.max(0, indent - 1);
      
      if (indent === 0) {
        resultParts.push(getIndent() + "}\n");
      } else {
        resultParts.push(getIndent() + "}\n");
      }
      
      i++;
      lastCharWasSpace = false;
      continue;
    }
    if (char === ";") {
      buffer += ";";
      resultParts.push(getIndent() + buffer.trim() + "\n");
      buffer = "";
      i++;
      lastCharWasSpace = false;
      continue;
    }
    if (char === "\n") {
      let trimmed = buffer.trim();
      if (trimmed.endsWith("*/")) {
         resultParts.push(getIndent() + trimmed + "\n");
         buffer = "";
         lastCharWasSpace = false;
      } else if (trimmed !== "") {
         if (!lastCharWasSpace) {
           buffer += " ";
           lastCharWasSpace = true;
         }
      }
      i++;
      continue;
    }

    if ((char === " " || char === "\t" || char === "\r") && !inString && !inComment) {
      if (!lastCharWasSpace) {
        buffer += " ";
        lastCharWasSpace = true;
      }
      i++;
      continue;
    }

    buffer += char;
    lastCharWasSpace = false;
    i++;
  }

  if (buffer.trim()) {
    resultParts.push(getIndent() + buffer.trim() + "\n");
  }

  return resultParts.join("").trim().replace(/\n{3,}/g, "\n\n") + "\n";
}