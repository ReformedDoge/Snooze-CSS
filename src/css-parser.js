export function updateCssString(css, selector, propsObj) {
  let inString = false;
  let stringChar = "";
  let inComment = false;
  let depth = 0;

  let blockStart = -1;
  let blockEnd = -1;
  let currentSelector = "";
  let selectorStart = 0;

  // Lexical Scan to find the exact block safely
  for (let i = 0; i < css.length; i++) {
    const char = css[i];
    const nextChar = css[i + 1];

    // Handle Comments
    if (!inString && char === "/" && nextChar === "*") {
      inComment = true;
      i++;
      continue;
    }
    if (inComment && char === "*" && nextChar === "/") {
      inComment = false;
      i++;
      selectorStart = i + 1;
      continue;
    }
    if (inComment) continue;

    // Handle Strings
    if (!inString && (char === '"' || char === "'")) {
      inString = true;
      stringChar = char;
      continue;
    }
    if (inString && char === stringChar && css[i - 1] !== "\\") {
      inString = false;
      continue;
    }
    if (inString) continue;

    // Handle Braces
    if (char === "{") {
      if (depth === 0) {
        currentSelector = css.substring(selectorStart, i).trim();
        // Check if this is the selector we are looking for
        if (
          currentSelector === selector ||
          currentSelector.endsWith(selector)
        ) {
          blockStart = i;
        }
      }
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        if (blockStart !== -1 && blockEnd === -1) {
          blockEnd = i;
          break; // We found our block, stop scanning!
        }
        selectorStart = i + 1;
      }
    }
  }

  // If the block was found, surgically update properties inside it
  if (blockStart !== -1 && blockEnd !== -1) {
    let inner = css.substring(blockStart + 1, blockEnd);

    for (const [prop, val] of Object.entries(propsObj)) {
      // Regex safe for INNER block property replacement
      const propRegex = new RegExp(
        `(^|[;\\s\\{])(${prop})\\s*:[^;\\}]+(;?)`,
        "gi",
      );
      if (propRegex.test(inner)) {
        inner = inner.replace(propRegex, `$1$2: ${val}$3`);
      } else {
        // Property doesn't exist, append it
        if (inner.trim().length > 0 && !inner.trim().endsWith(";"))
          inner = inner.trimEnd() + ";";
        inner += `\n\t${prop}: ${val};`;
      }
    }
    return css.substring(0, blockStart + 1) + inner + css.substring(blockEnd);
  }

  // If the block doesn't exist at all, append it to the end
  let newBlock = `\n${selector} {\n`;
  for (const [prop, val] of Object.entries(propsObj)) {
    newBlock += `\t${prop}: ${val};\n`;
  }
  newBlock += `}\n`;

  return css.trim() + "\n" + newBlock;
}
