"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VaultFolderSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");
var fs4 = __toESM(require("fs"));
var path5 = __toESM(require("path"));

// diff-view.ts
var import_obsidian = require("obsidian");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));

// node_modules/diff/lib/index.mjs
function Diff() {
}
Diff.prototype = {
  diff: function diff(oldString, newString) {
    var _options$timeout;
    var options = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    var callback = options.callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    this.options = options;
    var self = this;
    function done(value) {
      if (callback) {
        setTimeout(function() {
          callback(void 0, value);
        }, 0);
        return true;
      } else {
        return value;
      }
    }
    oldString = this.castInput(oldString);
    newString = this.castInput(newString);
    oldString = this.removeEmpty(this.tokenize(oldString));
    newString = this.removeEmpty(this.tokenize(newString));
    var newLen = newString.length, oldLen = oldString.length;
    var editLength = 1;
    var maxEditLength = newLen + oldLen;
    if (options.maxEditLength) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    var maxExecutionTime = (_options$timeout = options.timeout) !== null && _options$timeout !== void 0 ? _options$timeout : Infinity;
    var abortAfterTimestamp = Date.now() + maxExecutionTime;
    var bestPath = [{
      oldPos: -1,
      lastComponent: void 0
    }];
    var newPos = this.extractCommon(bestPath[0], newString, oldString, 0);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done([{
        value: this.join(newString),
        count: newString.length
      }]);
    }
    var minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    function execEditLength() {
      for (var diagonalPath = Math.max(minDiagonalToConsider, -editLength); diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        var basePath = void 0;
        var removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = void 0;
        }
        var canAdd = false;
        if (addPath) {
          var addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        var canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = void 0;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos + 1 < addPath.oldPos) {
          basePath = self.addToPath(addPath, true, void 0, 0);
        } else {
          basePath = self.addToPath(removePath, void 0, true, 1);
        }
        newPos = self.extractCommon(basePath, newString, oldString, diagonalPath);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(buildValues(self, basePath.lastComponent, newString, oldString, self.useLongestToken));
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    }
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback();
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        var ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  },
  addToPath: function addToPath(path6, added, removed, oldPosInc) {
    var last = path6.lastComponent;
    if (last && last.added === added && last.removed === removed) {
      return {
        oldPos: path6.oldPos + oldPosInc,
        lastComponent: {
          count: last.count + 1,
          added,
          removed,
          previousComponent: last.previousComponent
        }
      };
    } else {
      return {
        oldPos: path6.oldPos + oldPosInc,
        lastComponent: {
          count: 1,
          added,
          removed,
          previousComponent: last
        }
      };
    }
  },
  extractCommon: function extractCommon(basePath, newString, oldString, diagonalPath) {
    var newLen = newString.length, oldLen = oldString.length, oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(newString[newPos + 1], oldString[oldPos + 1])) {
      newPos++;
      oldPos++;
      commonCount++;
    }
    if (commonCount) {
      basePath.lastComponent = {
        count: commonCount,
        previousComponent: basePath.lastComponent
      };
    }
    basePath.oldPos = oldPos;
    return newPos;
  },
  equals: function equals(left, right) {
    if (this.options.comparator) {
      return this.options.comparator(left, right);
    } else {
      return left === right || this.options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  },
  removeEmpty: function removeEmpty(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  },
  castInput: function castInput(value) {
    return value;
  },
  tokenize: function tokenize(value) {
    return value.split("");
  },
  join: function join(chars) {
    return chars.join("");
  }
};
function buildValues(diff2, lastComponent, newString, oldString, useLongestToken) {
  var components = [];
  var nextComponent;
  while (lastComponent) {
    components.push(lastComponent);
    nextComponent = lastComponent.previousComponent;
    delete lastComponent.previousComponent;
    lastComponent = nextComponent;
  }
  components.reverse();
  var componentPos = 0, componentLen = components.length, newPos = 0, oldPos = 0;
  for (; componentPos < componentLen; componentPos++) {
    var component = components[componentPos];
    if (!component.removed) {
      if (!component.added && useLongestToken) {
        var value = newString.slice(newPos, newPos + component.count);
        value = value.map(function(value2, i) {
          var oldValue = oldString[oldPos + i];
          return oldValue.length > value2.length ? oldValue : value2;
        });
        component.value = diff2.join(value);
      } else {
        component.value = diff2.join(newString.slice(newPos, newPos + component.count));
      }
      newPos += component.count;
      if (!component.added) {
        oldPos += component.count;
      }
    } else {
      component.value = diff2.join(oldString.slice(oldPos, oldPos + component.count));
      oldPos += component.count;
      if (componentPos && components[componentPos - 1].added) {
        var tmp = components[componentPos - 1];
        components[componentPos - 1] = components[componentPos];
        components[componentPos] = tmp;
      }
    }
  }
  var finalComponent = components[componentLen - 1];
  if (componentLen > 1 && typeof finalComponent.value === "string" && (finalComponent.added || finalComponent.removed) && diff2.equals("", finalComponent.value)) {
    components[componentLen - 2].value += finalComponent.value;
    components.pop();
  }
  return components;
}
var characterDiff = new Diff();
var extendedWordChars = /^[A-Za-z\xC0-\u02C6\u02C8-\u02D7\u02DE-\u02FF\u1E00-\u1EFF]+$/;
var reWhitespace = /\S/;
var wordDiff = new Diff();
wordDiff.equals = function(left, right) {
  if (this.options.ignoreCase) {
    left = left.toLowerCase();
    right = right.toLowerCase();
  }
  return left === right || this.options.ignoreWhitespace && !reWhitespace.test(left) && !reWhitespace.test(right);
};
wordDiff.tokenize = function(value) {
  var tokens = value.split(/([^\S\r\n]+|[()[\]{}'"\r\n]|\b)/);
  for (var i = 0; i < tokens.length - 1; i++) {
    if (!tokens[i + 1] && tokens[i + 2] && extendedWordChars.test(tokens[i]) && extendedWordChars.test(tokens[i + 2])) {
      tokens[i] += tokens[i + 2];
      tokens.splice(i + 1, 2);
      i--;
    }
  }
  return tokens;
};
var lineDiff = new Diff();
lineDiff.tokenize = function(value) {
  if (this.options.stripTrailingCr) {
    value = value.replace(/\r\n/g, "\n");
  }
  var retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (var i = 0; i < linesAndNewlines.length; i++) {
    var line = linesAndNewlines[i];
    if (i % 2 && !this.options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      if (this.options.ignoreWhitespace) {
        line = line.trim();
      }
      retLines.push(line);
    }
  }
  return retLines;
};
function diffLines(oldStr, newStr, callback) {
  return lineDiff.diff(oldStr, newStr, callback);
}
var sentenceDiff = new Diff();
sentenceDiff.tokenize = function(value) {
  return value.split(/(\S.+?[.!?])(?=\s+|$)/);
};
var cssDiff = new Diff();
cssDiff.tokenize = function(value) {
  return value.split(/([{}:;,]|\s+)/);
};
function _typeof(obj) {
  "@babel/helpers - typeof";
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function(obj2) {
      return typeof obj2;
    };
  } else {
    _typeof = function(obj2) {
      return obj2 && typeof Symbol === "function" && obj2.constructor === Symbol && obj2 !== Symbol.prototype ? "symbol" : typeof obj2;
    };
  }
  return _typeof(obj);
}
function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _unsupportedIterableToArray(arr) || _nonIterableSpread();
}
function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) return _arrayLikeToArray(arr);
}
function _iterableToArray(iter) {
  if (typeof Symbol !== "undefined" && Symbol.iterator in Object(iter)) return Array.from(iter);
}
function _unsupportedIterableToArray(o, minLen) {
  if (!o) return;
  if (typeof o === "string") return _arrayLikeToArray(o, minLen);
  var n = Object.prototype.toString.call(o).slice(8, -1);
  if (n === "Object" && o.constructor) n = o.constructor.name;
  if (n === "Map" || n === "Set") return Array.from(o);
  if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen);
}
function _arrayLikeToArray(arr, len) {
  if (len == null || len > arr.length) len = arr.length;
  for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i];
  return arr2;
}
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
var objectPrototypeToString = Object.prototype.toString;
var jsonDiff = new Diff();
jsonDiff.useLongestToken = true;
jsonDiff.tokenize = lineDiff.tokenize;
jsonDiff.castInput = function(value) {
  var _this$options = this.options, undefinedReplacement = _this$options.undefinedReplacement, _this$options$stringi = _this$options.stringifyReplacer, stringifyReplacer = _this$options$stringi === void 0 ? function(k, v) {
    return typeof v === "undefined" ? undefinedReplacement : v;
  } : _this$options$stringi;
  return typeof value === "string" ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), stringifyReplacer, "  ");
};
jsonDiff.equals = function(left, right) {
  return Diff.prototype.equals.call(jsonDiff, left.replace(/,([\r\n])/g, "$1"), right.replace(/,([\r\n])/g, "$1"));
};
function canonicalize(obj, stack, replacementStack, replacer, key) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key, obj);
  }
  var i;
  for (i = 0; i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }
  var canonicalizedObj;
  if ("[object Array]" === objectPrototypeToString.call(obj)) {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0; i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, key);
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }
  if (_typeof(obj) === "object" && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    var sortedKeys = [], _key;
    for (_key in obj) {
      if (obj.hasOwnProperty(_key)) {
        sortedKeys.push(_key);
      }
    }
    sortedKeys.sort();
    for (i = 0; i < sortedKeys.length; i += 1) {
      _key = sortedKeys[i];
      canonicalizedObj[_key] = canonicalize(obj[_key], stack, replacementStack, replacer, _key);
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }
  return canonicalizedObj;
}
var arrayDiff = new Diff();
arrayDiff.tokenize = function(value) {
  return value.slice();
};
arrayDiff.join = arrayDiff.removeEmpty = function(value) {
  return value;
};
function structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  if (!options) {
    options = {};
  }
  if (typeof options.context === "undefined") {
    options.context = 4;
  }
  var diff2 = diffLines(oldStr, newStr, options);
  if (!diff2) {
    return;
  }
  diff2.push({
    value: "",
    lines: []
  });
  function contextLines(lines) {
    return lines.map(function(entry) {
      return " " + entry;
    });
  }
  var hunks = [];
  var oldRangeStart = 0, newRangeStart = 0, curRange = [], oldLine = 1, newLine = 1;
  var _loop = function _loop2(i2) {
    var current = diff2[i2], lines = current.lines || current.value.replace(/\n$/, "").split("\n");
    current.lines = lines;
    if (current.added || current.removed) {
      var _curRange;
      if (!oldRangeStart) {
        var prev = diff2[i2 - 1];
        oldRangeStart = oldLine;
        newRangeStart = newLine;
        if (prev) {
          curRange = options.context > 0 ? contextLines(prev.lines.slice(-options.context)) : [];
          oldRangeStart -= curRange.length;
          newRangeStart -= curRange.length;
        }
      }
      (_curRange = curRange).push.apply(_curRange, _toConsumableArray(lines.map(function(entry) {
        return (current.added ? "+" : "-") + entry;
      })));
      if (current.added) {
        newLine += lines.length;
      } else {
        oldLine += lines.length;
      }
    } else {
      if (oldRangeStart) {
        if (lines.length <= options.context * 2 && i2 < diff2.length - 2) {
          var _curRange2;
          (_curRange2 = curRange).push.apply(_curRange2, _toConsumableArray(contextLines(lines)));
        } else {
          var _curRange3;
          var contextSize = Math.min(lines.length, options.context);
          (_curRange3 = curRange).push.apply(_curRange3, _toConsumableArray(contextLines(lines.slice(0, contextSize))));
          var hunk = {
            oldStart: oldRangeStart,
            oldLines: oldLine - oldRangeStart + contextSize,
            newStart: newRangeStart,
            newLines: newLine - newRangeStart + contextSize,
            lines: curRange
          };
          if (i2 >= diff2.length - 2 && lines.length <= options.context) {
            var oldEOFNewline = /\n$/.test(oldStr);
            var newEOFNewline = /\n$/.test(newStr);
            var noNlBeforeAdds = lines.length == 0 && curRange.length > hunk.oldLines;
            if (!oldEOFNewline && noNlBeforeAdds && oldStr.length > 0) {
              curRange.splice(hunk.oldLines, 0, "\\ No newline at end of file");
            }
            if (!oldEOFNewline && !noNlBeforeAdds || !newEOFNewline) {
              curRange.push("\\ No newline at end of file");
            }
          }
          hunks.push(hunk);
          oldRangeStart = 0;
          newRangeStart = 0;
          curRange = [];
        }
      }
      oldLine += lines.length;
      newLine += lines.length;
    }
  };
  for (var i = 0; i < diff2.length; i++) {
    _loop(i);
  }
  return {
    oldFileName,
    newFileName,
    oldHeader,
    newHeader,
    hunks
  };
}
function formatPatch(diff2) {
  if (Array.isArray(diff2)) {
    return diff2.map(formatPatch).join("\n");
  }
  var ret = [];
  if (diff2.oldFileName == diff2.newFileName) {
    ret.push("Index: " + diff2.oldFileName);
  }
  ret.push("===================================================================");
  ret.push("--- " + diff2.oldFileName + (typeof diff2.oldHeader === "undefined" ? "" : "	" + diff2.oldHeader));
  ret.push("+++ " + diff2.newFileName + (typeof diff2.newHeader === "undefined" ? "" : "	" + diff2.newHeader));
  for (var i = 0; i < diff2.hunks.length; i++) {
    var hunk = diff2.hunks[i];
    if (hunk.oldLines === 0) {
      hunk.oldStart -= 1;
    }
    if (hunk.newLines === 0) {
      hunk.newStart -= 1;
    }
    ret.push("@@ -" + hunk.oldStart + "," + hunk.oldLines + " +" + hunk.newStart + "," + hunk.newLines + " @@");
    ret.push.apply(ret, hunk.lines);
  }
  return ret.join("\n") + "\n";
}
function createTwoFilesPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options) {
  return formatPatch(structuredPatch(oldFileName, newFileName, oldStr, newStr, oldHeader, newHeader, options));
}

// diff-view.ts
var DIFF_VIEW_TYPE = "vault-folder-sync-diff-view";
var conflictEntries = [];
var currentConflictIndex = 0;
var VaultFolderSyncDiffView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
  }
  getViewType() {
    return DIFF_VIEW_TYPE;
  }
  getDisplayText() {
    return "Vault Folder Sync Diff";
  }
  async onOpen() {
    this.render();
  }
  async setState(state, result) {
    if (state && typeof state.index === "number") {
      const idx = state.index;
      if (!Number.isNaN(idx) && idx >= 0 && idx < conflictEntries.length) {
        currentConflictIndex = idx;
      }
    }
    this.render();
  }
  getState() {
    return { index: currentConflictIndex };
  }
  render() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.style.height = "100%";
    containerEl.style.display = "flex";
    containerEl.style.flexDirection = "column";
    const total = conflictEntries.length;
    const index = total === 0 ? -1 : Math.min(Math.max(currentConflictIndex, 0), total - 1);
    const current = index >= 0 && index < total ? conflictEntries[index] : null;
    const header = containerEl.createDiv({
      cls: "vault-folder-sync-diff-header"
    });
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    const titleText = current != null ? `\u51B2\u7A81\u6587\u4EF6\uFF1A${current.relPath}` : "\u5F53\u524D\u6CA1\u6709\u51B2\u7A81\u6587\u4EF6";
    header.createEl("h3", {
      text: titleText
    });
    const nav = header.createDiv({
      cls: "vault-folder-sync-diff-nav"
    });
    nav.style.display = "flex";
    nav.style.alignItems = "center";
    nav.style.gap = "0.5em";
    const info = nav.createSpan({
      text: total > 0 ? `${index + 1} / ${total}` : "0 / 0"
    });
    const prevBtn = nav.createEl("button", { text: "\u2190 \u4E0A\u4E00\u4E2A" });
    const nextBtn = nav.createEl("button", { text: "\u4E0B\u4E00\u4E2A \u2192" });
    const resolveBtn = nav.createEl("button", { text: "\u5DF2\u89E3\u51B3\u51B2\u7A81" });
    prevBtn.disabled = total <= 1;
    nextBtn.disabled = total <= 1;
    resolveBtn.disabled = !current;
    prevBtn.onclick = () => {
      if (conflictEntries.length === 0) return;
      currentConflictIndex = (currentConflictIndex - 1 + conflictEntries.length) % conflictEntries.length;
      this.render();
    };
    nextBtn.onclick = () => {
      if (conflictEntries.length === 0) return;
      currentConflictIndex = (currentConflictIndex + 1) % conflictEntries.length;
      this.render();
    };
    resolveBtn.onclick = async () => {
      if (!current) return;
      await markConflictResolved(this.app, current.relPath);
      conflictEntries = conflictEntries.filter(
        (e) => e.relPath !== current.relPath
      );
      if (currentConflictIndex >= conflictEntries.length) {
        currentConflictIndex = conflictEntries.length - 1;
      }
      if (currentConflictIndex < 0) currentConflictIndex = 0;
      this.render();
    };
    const pre = containerEl.createEl("pre", {
      cls: "vault-folder-sync-diff-pre"
    });
    pre.style.flex = "1 1 auto";
    pre.style.width = "100%";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.fontFamily = "var(--font-monospace)";
    pre.style.overflowY = "auto";
    if (current) {
      pre.setText(current.patch || "(\u65E0\u5DEE\u5F02\u6216\u65E0\u6CD5\u52A0\u8F7D\u5185\u5BB9)");
    } else {
      pre.setText("(\u5F53\u524D\u6CA1\u6709\u53EF\u663E\u793A\u7684\u51B2\u7A81 diff)");
    }
  }
};
function registerDiffView(plugin) {
  plugin.registerView(
    DIFF_VIEW_TYPE,
    (leaf) => new VaultFolderSyncDiffView(leaf)
  );
}
function closeDiffViewIfNoConflicts(app) {
  if (conflictEntries.length > 0) return;
  const leaves = app.workspace.getLeavesOfType(DIFF_VIEW_TYPE);
  for (const leaf of leaves) {
    leaf.detach();
  }
}
async function markConflictResolved(app, relPath) {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof import_obsidian.FileSystemAdapter)) return;
  const root = adapter.getBasePath();
  const logPath = path.join(
    root,
    ".obsidian",
    "vault-folder-sync-log.jsonl"
  );
  const entries = await readRawLogEntriesForView(logPath);
  const updated = entries.map(
    (e) => e.relPath === relPath ? { ...e, resolved: true } : e
  );
  const text = updated.length > 0 ? updated.map((e) => JSON.stringify(e)).join("\n") + "\n" : "";
  await ensureDirForView(path.dirname(logPath));
  await fs.promises.writeFile(logPath, text, "utf8");
}
async function readRawLogEntriesForView(p) {
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    const lines = raw.split(/\r?\n/);
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (!entry.relPath) continue;
        result.push(entry);
      } catch {
        continue;
      }
    }
    return result;
  } catch {
    return [];
  }
}
async function ensureDirForView(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

// log-view.ts
var import_obsidian2 = require("obsidian");
var fs2 = __toESM(require("fs"));
var path2 = __toESM(require("path"));
function getVaultBasePath(app) {
  const adapter = app.vault.adapter;
  if (adapter instanceof import_obsidian2.FileSystemAdapter) {
    return adapter.getBasePath();
  }
  return null;
}
function createLogView(containerEl, app) {
  containerEl.createEl("h3", { text: "\u65E5\u5FD7\u67E5\u770B" });
  const logSection = containerEl.createDiv();
  const logInfo = logSection.createEl("p", {
    text: "\u67E5\u770B\u5F53\u524D vault \u4E0B .obsidian/vault-folder-sync-log.jsonl \u4E2D\u8BB0\u5F55\u7684\u540C\u6B65\u4E0E\u5220\u9664\u65E5\u5FD7\uFF08\u6309\u884C\u8FFD\u52A0\u7684 JSON \u65E5\u5FD7\uFF09\u3002"
  });
  logInfo.style.whiteSpace = "pre-wrap";
  const logContainer = logSection.createDiv({
    cls: "vault-folder-sync-log-container"
  });
  logContainer.style.border = "1px solid var(--background-modifier-border)";
  logContainer.style.borderRadius = "4px";
  logContainer.style.marginTop = "0.5em";
  logContainer.style.height = "200px";
  logContainer.style.overflow = "auto";
  logContainer.style.backgroundColor = "var(--background-primary-alt)";
  const logPre = logContainer.createEl("pre", {
    cls: "vault-folder-sync-log-pre"
  });
  logPre.style.margin = "0";
  logPre.style.padding = "0.5em";
  logPre.style.whiteSpace = "pre-wrap";
  logPre.style.fontFamily = "var(--font-monospace)";
  logPre.setText("\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\u52A0\u8F7D\u65E5\u5FD7\u5185\u5BB9\u2026");
  new import_obsidian2.Setting(logSection).setName("\u67E5\u770B\u540C\u6B65\u65E5\u5FD7\u6587\u4EF6").setDesc(".obsidian/vault-folder-sync-log.jsonl").addButton(
    (button) => button.setButtonText("\u52A0\u8F7D\u65E5\u5FD7").onClick(async () => {
      try {
        const basePath = getVaultBasePath(app);
        if (!basePath) {
          logPre.setText(
            "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8BFB\u53D6\u672C\u5730\u6587\u4EF6\u7CFB\u7EDF\u65E5\u5FD7\uFF08\u9700\u8981\u684C\u9762\u7248 Obsidian\uFF09\u3002"
          );
          return;
        }
        const logPath = path2.join(
          basePath,
          ".obsidian",
          "vault-folder-sync-log.jsonl"
        );
        const exists = await fs2.promises.access(logPath).then(
          () => true,
          () => false
        );
        if (!exists) {
          logPre.setText(
            "\u5C1A\u672A\u627E\u5230\u65E5\u5FD7\u6587\u4EF6\uFF1A.obsidian/vault-folder-sync-log.jsonl"
          );
          return;
        }
        const content = await fs2.promises.readFile(
          logPath,
          "utf8"
        );
        logPre.setText(content || "(\u65E5\u5FD7\u6587\u4EF6\u4E3A\u7A7A)");
      } catch (err) {
        console.error(
          "Vault Folder Sync: \u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25",
          err
        );
        logPre.setText(
          "\u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u5F00\u53D1\u8005\u63A7\u5236\u53F0\u83B7\u53D6\u8BE6\u7EC6\u9519\u8BEF\u4FE1\u606F\u3002"
        );
      }
    })
  );
}

// filename-map.ts
var path3 = __toESM(require("path"));
var DEFAULT_FILENAME_RULES = [
  { from: ":", to: "\uFF1A" },
  { from: "?", to: "\uFF1F" },
  { from: "*", to: "\uFF0A" },
  { from: "<", to: "\uFF1C" },
  { from: ">", to: "\uFF1E" },
  { from: '"', to: "\uFF02" },
  { from: "|", to: "\uFF5C" },
  { from: "\\", to: "\uFF3C" },
  // 在很多系统中允许空格，但为了兼容用户在 Windows 下的命名习惯，这里默认替换为空心点
  { from: " ", to: "\xB7" },
  // 保险起见，路径分隔符 “/” 也做一次映射，避免出现在单个段名中时出问题
  { from: "/", to: "\uFF0F" }
];
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function mapSegmentForward(segment, rules) {
  let result = segment;
  for (const rule of rules) {
    if (!rule.from) continue;
    const from = escapeRegExp(rule.from);
    const re = new RegExp(from, "g");
    result = result.replace(re, rule.to ?? "");
  }
  return result;
}
function mapSegmentBackward(segment, rules) {
  let result = segment;
  for (const rule of rules) {
    if (!rule.to) continue;
    const to = escapeRegExp(rule.to);
    const re = new RegExp(to, "g");
    result = result.replace(re, rule.from);
  }
  return result;
}
function getTargetAbsolutePath(targetRoot, relPath, rules) {
  if (!relPath) {
    return targetRoot;
  }
  const segments = relPath.split("/");
  const mapped = segments.map(
    (seg) => seg === "" ? seg : mapSegmentForward(seg, rules)
  );
  return path3.join(targetRoot, ...mapped);
}
function getSourceAbsolutePath(sourceRoot, relPath) {
  if (!relPath) {
    return sourceRoot;
  }
  const segments = relPath.split("/");
  return path3.join(sourceRoot, ...segments);
}

// reverse-sync.ts
var import_obsidian3 = require("obsidian");
var fs3 = __toESM(require("fs"));
var path4 = __toESM(require("path"));
var MTIME_EPS_MS = 1;
var DIFF_VIEW_TYPE2 = "vault-folder-sync-diff-view";
var LOG_FILE_NAME = "vault-folder-sync-log.jsonl";
var LOG_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
var conflictEntries2 = [];
var currentConflictIndex2 = 0;
async function openDiffForConflict(app, relPath, sourcePath, targetPath) {
  const [sourceText, targetText] = await Promise.all([
    readFileSafe(sourcePath),
    readFileSafe(targetPath)
  ]);
  const patch = createTwoFilesPatch(
    `source: ${relPath}`,
    `target: ${relPath}`,
    sourceText,
    targetText
  );
  const existingIndex = conflictEntries2.findIndex(
    (e) => e.relPath === relPath && e.sourcePath === sourcePath && e.targetPath === targetPath
  );
  if (existingIndex >= 0) {
    conflictEntries2[existingIndex].patch = patch;
    currentConflictIndex2 = existingIndex;
  } else {
    conflictEntries2.push({
      relPath,
      sourcePath,
      targetPath,
      patch
    });
    currentConflictIndex2 = conflictEntries2.length - 1;
  }
  const leaves = app.workspace.getLeavesOfType(DIFF_VIEW_TYPE2);
  let leaf;
  if (leaves.length > 0) {
    for (let i = 1; i < leaves.length; i++) {
      leaves[i].detach();
    }
    leaf = leaves[0];
  } else {
    const maybeLeaf = app.workspace.getRightLeaf(false);
    if (!maybeLeaf) {
      return;
    }
    leaf = maybeLeaf;
  }
  await leaf.setViewState({
    type: DIFF_VIEW_TYPE2,
    active: true,
    state: {
      index: currentConflictIndex2
    }
  });
  app.workspace.revealLeaf(leaf);
}
async function runReverseSyncForTargets(app, sourceRoot, targetRoots) {
  if (targetRoots.length === 0) return;
  const deletionLogPath = getDeletionLogPath(sourceRoot);
  let log = await loadDeletionLog(deletionLogPath);
  currentRawLogEntries = await readRawLogEntries(deletionLogPath);
  for (const targetRoot of targetRoots) {
    log = await syncOneTarget(
      app,
      sourceRoot,
      targetRoot,
      log,
      deletionLogPath
    );
  }
}
async function mergeLogsForTargets(sourceRoot, targetRoots) {
  if (targetRoots.length === 0) return;
  for (const targetRoot of targetRoots) {
    await mergeLogsBetween(sourceRoot, targetRoot);
  }
}
async function logLocalSourceChange(app, relPath, kind) {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof import_obsidian3.FileSystemAdapter)) return;
  const root = adapter.getBasePath();
  const logPath = getDeletionLogPath(root);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const base = {
    relPath,
    side: "source",
    event: kind,
    merged: false,
    resolved: false
  };
  const entry = kind === "deleted" ? { ...base, deletedAt: nowIso } : { ...base, modifiedAt: nowIso };
  await ensureDir(path4.dirname(logPath));
  const line = JSON.stringify(entry);
  await fs3.promises.appendFile(logPath, line + "\n", "utf8");
}
async function logLocalRename(app, fromRelPath, toRelPath) {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof import_obsidian3.FileSystemAdapter)) return;
  const root = adapter.getBasePath();
  const logPath = getDeletionLogPath(root);
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const renameId = `${nowIso}-${Math.random().toString(36).slice(2, 8)}`;
  const deletedEntry = {
    relPath: fromRelPath,
    side: "source",
    event: "deleted",
    deletedAt: nowIso,
    merged: false,
    resolved: false,
    rename: true,
    renameTo: toRelPath,
    renameId
  };
  const createdEntry = {
    relPath: toRelPath,
    side: "source",
    event: "modified",
    modifiedAt: nowIso,
    merged: false,
    resolved: false,
    rename: true,
    renameFrom: fromRelPath,
    renameId
  };
  await ensureDir(path4.dirname(logPath));
  const text = JSON.stringify(deletedEntry) + "\n" + JSON.stringify(createdEntry) + "\n";
  await fs3.promises.appendFile(logPath, text, "utf8");
}
function getDeletionLogPath(sourceRoot) {
  return path4.join(
    sourceRoot,
    ".obsidian",
    LOG_FILE_NAME
  );
}
async function loadDeletionLog(p) {
  try {
    const raw = await fs3.promises.readFile(p, "utf8");
    const log = {};
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry;
      try {
        entry = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!entry.targetRoot || !entry.relPath) continue;
      if (entry.resolved === true) continue;
      if (!Object.prototype.hasOwnProperty.call(entry, "deletedAt")) {
        continue;
      }
      if (!log[entry.targetRoot]) {
        log[entry.targetRoot] = {};
      }
      const existing = log[entry.targetRoot][entry.relPath];
      if (entry.deletedAt == null) {
        delete log[entry.targetRoot][entry.relPath];
        continue;
      }
      if (!existing) {
        log[entry.targetRoot][entry.relPath] = entry.deletedAt;
        continue;
      }
      const existingTs = Date.parse(existing);
      const newTs = Date.parse(entry.deletedAt);
      if (!Number.isNaN(newTs) && newTs >= existingTs) {
        log[entry.targetRoot][entry.relPath] = entry.deletedAt;
      }
    }
    return log;
  } catch {
    return {};
  }
}
async function appendDeletionLogEntry(logPath, entry) {
  await ensureDir(path4.dirname(logPath));
  const enriched = {
    ...entry,
    side: "target",
    event: "deleted"
  };
  const line = JSON.stringify(enriched);
  await fs3.promises.appendFile(logPath, line + "\n", "utf8");
}
async function mergeLogsBetween(rootA, rootB) {
  const logPathA = getDeletionLogPath(rootA);
  const logPathB = getDeletionLogPath(rootB);
  const [entriesA, entriesB] = await Promise.all([
    readRawLogEntries(logPathA),
    readRawLogEntries(logPathB)
  ]);
  const merged = mergeRawEntries(entriesA, entriesB);
  const text = merged.length > 0 ? merged.map((e) => JSON.stringify(e)).join("\n") + "\n" : "";
  await ensureDir(path4.dirname(logPathA));
  await ensureDir(path4.dirname(logPathB));
  await Promise.all([
    fs3.promises.writeFile(logPathA, text, "utf8"),
    fs3.promises.writeFile(logPathB, text, "utf8")
  ]);
}
var currentRawLogEntries = [];
async function readRawLogEntries(p) {
  try {
    const raw = await fs3.promises.readFile(p, "utf8");
    const lines = raw.split(/\r?\n/);
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (!entry.relPath) continue;
        result.push(entry);
      } catch {
        continue;
      }
    }
    return result;
  } catch {
    return [];
  }
}
function getEntryTimeMs(entry) {
  const t = entry.deletedAt && typeof entry.deletedAt === "string" ? Date.parse(entry.deletedAt) : entry.modifiedAt && typeof entry.modifiedAt === "string" ? Date.parse(entry.modifiedAt) : NaN;
  if (Number.isNaN(t)) return void 0;
  return t;
}
function mergeRawEntries(a, b) {
  const byKey = /* @__PURE__ */ new Map();
  const add = (entry) => {
    const copy = { ...entry };
    delete copy.merged;
    const key = JSON.stringify(copy);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      return;
    }
    const tNew = getEntryTimeMs(entry);
    const tOld = getEntryTimeMs(existing);
    if (tNew !== void 0 && (tOld === void 0 || tNew >= tOld)) {
      byKey.set(key, entry);
    }
  };
  a.forEach(add);
  b.forEach(add);
  const now = Date.now();
  const entries = Array.from(byKey.values());
  const filtered = entries.filter((e) => {
    const t = getEntryTimeMs(e);
    if (t === void 0) return true;
    if (e.merged && now - t > LOG_TTL_MS) {
      return false;
    }
    return true;
  });
  for (const e of filtered) {
    e.merged = true;
  }
  filtered.sort((e1, e2) => {
    const t1 = getEntryTimeMs(e1) ?? 0;
    const t2 = getEntryTimeMs(e2) ?? 0;
    return t1 - t2;
  });
  return filtered;
}
function getLatestUnresolvedEventsFor(relPath) {
  const result = {};
  for (const e of currentRawLogEntries) {
    if (e.relPath !== relPath) continue;
    if (e.resolved) continue;
    const t = getEntryTimeMs(e);
    if (t === void 0) continue;
    const isDeleted = typeof e.deletedAt === "string";
    const isModified = typeof e.modifiedAt === "string";
    const side = e.side;
    if (side === "source") {
      if (isModified) {
        if (!result.sourceModified || (getEntryTimeMs(result.sourceModified) ?? 0) < t) {
          result.sourceModified = e;
        }
      }
      if (isDeleted) {
        if (!result.sourceDeleted || (getEntryTimeMs(result.sourceDeleted) ?? 0) < t) {
          result.sourceDeleted = e;
        }
      }
    } else if (side === "target") {
      if (isModified) {
        if (!result.targetModified || (getEntryTimeMs(result.targetModified) ?? 0) < t) {
          result.targetModified = e;
        }
      }
      if (isDeleted) {
        if (!result.targetDeleted || (getEntryTimeMs(result.targetDeleted) ?? 0) < t) {
          result.targetDeleted = e;
        }
      }
    }
  }
  return result;
}
async function syncOneTarget(app, sourceRoot, targetRoot, log, logPath) {
  const normalizedTarget = path4.resolve(targetRoot);
  if (!log[normalizedTarget]) {
    log[normalizedTarget] = {};
  }
  const perTargetLog = log[normalizedTarget];
  await ensureDir(normalizedTarget);
  await traverseTargetAndSync(app, sourceRoot, normalizedTarget, perTargetLog);
  await handleDeletions(
    app,
    sourceRoot,
    normalizedTarget,
    perTargetLog,
    logPath
  );
  log[normalizedTarget] = perTargetLog;
  return log;
}
async function traverseTargetAndSync(app, sourceRoot, targetRoot, perTargetLog) {
  const actions = [];
  async function walk(currentTargetDir) {
    const relDir = path4.relative(targetRoot, currentTargetDir);
    const sourceDir = relDir === "" ? sourceRoot : path4.join(sourceRoot, relDir);
    await ensureDir(sourceDir);
    const entries = await fs3.promises.readdir(currentTargetDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const targetPath = path4.join(currentTargetDir, entry.name);
      const relPath = path4.relative(targetRoot, targetPath);
      const sourcePath = path4.join(sourceRoot, relPath);
      if (shouldSkipMetaFile(relPath)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(targetPath);
      } else if (entry.isFile()) {
        const srcStat = await fs3.promises.stat(sourcePath).catch(
          () => null
        );
        const tgtStat = await fs3.promises.stat(targetPath);
        if (!srcStat || !srcStat.isFile()) {
          const latestForDeletion = getLatestUnresolvedEventsFor(
            relPath
          );
          const deletionEntry = latestForDeletion.sourceDeleted;
          if (deletionEntry) {
            continue;
          }
          actions.push({
            type: "copyTargetToSource",
            relPath,
            sourcePath,
            targetPath,
            targetMtimeMs: tgtStat.mtimeMs
          });
          continue;
        }
        const diff2 = Math.abs(tgtStat.mtimeMs - srcStat.mtimeMs);
        if (diff2 <= MTIME_EPS_MS) {
          continue;
        }
        const latest = getLatestUnresolvedEventsFor(relPath);
        const hasSourceChange = !!latest.sourceModified || !!latest.sourceDeleted;
        const hasTargetChange = !!latest.targetModified || !!latest.targetDeleted;
        if (tgtStat.mtimeMs > srcStat.mtimeMs + MTIME_EPS_MS) {
          if (hasSourceChange && hasTargetChange) {
            actions.push({
              type: "conflict",
              relPath,
              sourcePath,
              targetPath
            });
          } else {
            actions.push({
              type: "copyTargetToSource",
              relPath,
              sourcePath,
              targetPath,
              targetMtimeMs: tgtStat.mtimeMs
            });
          }
        } else {
          if (hasSourceChange && hasTargetChange) {
            actions.push({
              type: "conflict",
              relPath,
              sourcePath,
              targetPath
            });
          }
        }
      }
    }
  }
  await walk(targetRoot);
  for (const action of actions) {
    if (action.type === "copyTargetToSource") {
      const { relPath, sourcePath, targetPath, targetMtimeMs } = action;
      try {
        await ensureDir(path4.dirname(sourcePath));
        await copyFileWithMetadata(targetPath, sourcePath);
        delete perTargetLog[relPath];
        if (typeof targetMtimeMs === "number") {
          await appendModificationLogEntry(
            getDeletionLogPath(sourceRoot),
            {
              targetRoot,
              relPath,
              modifiedAt: new Date(
                targetMtimeMs
              ).toISOString()
            }
          );
        }
      } catch (err) {
        console.error(
          "Vault Folder Sync: reverse copy failed for",
          relPath,
          err
        );
      }
    } else if (action.type === "conflict") {
      const { relPath, sourcePath, targetPath } = action;
      new import_obsidian3.Notice(
        `Vault Folder Sync: \u53CD\u5411\u540C\u6B65\u51B2\u7A81\uFF08\u4E24\u7AEF\u5747\u6709\u4FEE\u6539\uFF09\uFF1A${relPath}`
      );
      await openDiffForConflict(app, relPath, sourcePath, targetPath);
    }
  }
}
async function handleDeletions(app, sourceRoot, targetRoot, perTargetLog, logPath) {
  async function walkSourceDir(currentSourceDir) {
    const relDir = path4.relative(sourceRoot, currentSourceDir);
    const currentTargetDir = relDir === "" ? targetRoot : path4.join(targetRoot, relDir);
    const entries = await fs3.promises.readdir(currentSourceDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const sourcePath = path4.join(currentSourceDir, entry.name);
      const relPath = path4.relative(sourceRoot, sourcePath);
      const targetPath = path4.join(targetRoot, relPath);
      if (shouldSkipMetaFile(relPath)) {
        continue;
      }
      const targetExists = await pathExists(targetPath);
      if (entry.isDirectory()) {
        if (targetExists) {
          await walkSourceDir(sourcePath);
        } else {
          await handleSingleDeletion(
            app,
            sourcePath,
            relPath,
            perTargetLog,
            logPath,
            targetRoot
          );
        }
      } else if (entry.isFile()) {
        if (!targetExists) {
          await handleSingleDeletion(
            app,
            sourcePath,
            relPath,
            perTargetLog,
            logPath,
            targetRoot
          );
        }
      }
    }
  }
  await walkSourceDir(sourceRoot);
}
async function handleSingleDeletion(app, sourcePath, relPath, perTargetLog, logPath, targetRoot) {
  const srcStat = await fs3.promises.stat(sourcePath).catch(() => null);
  if (!srcStat) {
    delete perTargetLog[relPath];
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: null
    });
    return;
  }
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const existing = perTargetLog[relPath];
  const latestEvents = getLatestUnresolvedEventsFor(relPath);
  const hasSourceChange = !!latestEvents.sourceModified || !!latestEvents.sourceDeleted;
  const hasTargetDelete = !!latestEvents.targetDeleted;
  if (hasSourceChange && !hasTargetDelete) {
    return;
  }
  if (!existing) {
    perTargetLog[relPath] = nowIso;
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: nowIso
    });
    return;
  }
  const deletionTime = Date.parse(existing);
  if (Number.isNaN(deletionTime)) {
    perTargetLog[relPath] = nowIso;
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: nowIso
    });
    return;
  }
  if (deletionTime > srcStat.mtimeMs + MTIME_EPS_MS) {
    await deletePathIfExists(sourcePath);
    delete perTargetLog[relPath];
    await appendDeletionLogEntry(logPath, {
      targetRoot,
      relPath,
      deletedAt: null
    });
  } else {
    const latest = getLatestUnresolvedEventsFor(relPath);
    const hasSourceChange2 = !!latest.sourceModified || !!latest.sourceDeleted;
    const hasTargetChange = !!latest.targetModified || !!latest.targetDeleted;
    if (hasSourceChange2 && hasTargetChange) {
      new import_obsidian3.Notice(
        `Vault Folder Sync: \u53CD\u5411\u540C\u6B65\u5220\u9664\u51B2\u7A81\uFF08\u4E24\u7AEF\u5747\u6709\u4FEE\u6539/\u5220\u9664\uFF09\uFF1A${relPath}`
      );
      await openDiffForConflict(app, relPath, sourcePath, "");
    }
  }
}
function shouldSkipMetaFile(relPath) {
  const normalized = relPath.split(path4.sep).join("/");
  if (normalized === ".obsidian/vault-folder-sync.json" || normalized === ".obsidian/vault-folder-sync-log.jsonl") {
    return true;
  }
  return false;
}
async function ensureDir(dirPath) {
  await fs3.promises.mkdir(dirPath, { recursive: true });
}
async function pathExists(p) {
  try {
    await fs3.promises.access(p);
    return true;
  } catch {
    return false;
  }
}
async function deletePathIfExists(p) {
  if (!await pathExists(p)) return;
  const stat = await fs3.promises.stat(p);
  if (stat.isDirectory()) {
    await fs3.promises.rm(p, { recursive: true, force: true });
  } else {
    await fs3.promises.unlink(p);
  }
}
async function copyFileWithMetadata(sourceFile, targetFile) {
  const stat = await fs3.promises.stat(sourceFile);
  await fs3.promises.copyFile(sourceFile, targetFile);
  try {
    await fs3.promises.utimes(targetFile, stat.atime, stat.mtime);
  } catch (err) {
    console.error(
      "Vault Folder Sync: failed to preserve file times for",
      targetFile,
      err
    );
  }
}
async function readFileSafe(p) {
  try {
    const buf = await fs3.promises.readFile(p);
    return buf.toString("utf8");
  } catch {
    return "";
  }
}
async function appendModificationLogEntry(logPath, entry) {
  await ensureDir(path4.dirname(logPath));
  const enriched = {
    ...entry,
    side: "target",
    event: "modified"
  };
  const line = JSON.stringify(enriched);
  await fs3.promises.appendFile(logPath, line + "\n", "utf8");
}

// main.ts
var DEFAULT_SETTINGS = {
  targets: [],
  syncIntervalSeconds: 30,
  filenameRules: DEFAULT_FILENAME_RULES.map((r) => ({ ...r }))
};
var VaultFolderSyncPlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.changedFiles = /* @__PURE__ */ new Map();
    this.pendingRenames = [];
    this.isSyncing = false;
    this.statusBarItem = null;
  }
  async onload() {
    await this.loadSettings();
    registerDiffView(this);
    this.statusBarItem = this.addStatusBarItem();
    this.setStatusSyncing();
    this.registerVaultEvents();
    this.registerCommands();
    this.addSettingTab(new VaultFolderSyncSettingTab(this.app, this));
    const intervalMs = (this.settings.syncIntervalSeconds || 30) * 1e3;
    this.registerInterval(
      window.setInterval(() => {
        this.runPeriodicSync();
      }, intervalMs)
    );
    const sourceRoot = this.getVaultRootPath();
    const enabledTargets = this.settings.targets.filter(
      (t) => t.enabled && t.path.trim().length > 0
    );
    const enabledTargetPaths = enabledTargets.map((t) => t.path);
    mergeLogsForTargets(sourceRoot, enabledTargetPaths).then(() => this.runReverseSyncOnce(sourceRoot)).then(() => this.triggerSync(false)).then(() => this.verifyTargetsByMtime(sourceRoot, enabledTargets)).then(() => {
      closeDiffViewIfNoConflicts(this.app);
    }).catch((err) => {
      console.error("Initial sync error:", err);
      new import_obsidian4.Notice(
        "Vault Folder Sync: Initial sync failed, see console for details."
      );
    });
  }
  async runPeriodicSync() {
    const sourceRoot = this.getVaultRootPath();
    const enabledTargets = this.settings.targets.filter(
      (t) => t.path.trim().length > 0
    );
    const enabledTargetPaths = enabledTargets.map((t) => t.path);
    await mergeLogsForTargets(sourceRoot, enabledTargetPaths);
    if (this.isSyncing) return;
    const hasLocalChanges = this.changedFiles.size > 0 || this.pendingRenames.length > 0;
    if (hasLocalChanges) {
      await this.triggerSync(false);
      await this.runReverseSyncOnce(sourceRoot);
    } else {
      await this.runReverseSyncOnce(sourceRoot);
      await this.triggerSync(false);
    }
  }
  onunload() {
    this.triggerSync(false).catch((err) => {
      console.error("Final sync error:", err);
    });
  }
  registerVaultEvents() {
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file instanceof import_obsidian4.TFile) {
          this.markFileChanged(file, "created");
          logLocalSourceChange(this.app, file.path, "modified").catch(
            () => {
            }
          );
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof import_obsidian4.TFile) {
          this.markFileChanged(file, "modified");
          logLocalSourceChange(this.app, file.path, "modified").catch(
            () => {
            }
          );
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.markPathDeleted(file.path);
        logLocalSourceChange(this.app, file.path, "deleted").catch(
          () => {
          }
        );
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.markRename(oldPath, file.path);
        logLocalRename(this.app, oldPath, file.path).catch(() => {
        });
      })
    );
  }
  registerCommands() {
    this.addCommand({
      id: "vault-folder-sync-now",
      name: "\u7ACB\u5373\u540C\u6B65\u6240\u6709\u76EE\u6807\u76EE\u5F55",
      callback: () => {
        this.triggerSync(false, true).catch((err) => {
          console.error("Manual sync error:", err);
          new import_obsidian4.Notice("Vault Folder Sync: Manual sync failed, see console for details.");
        });
      }
    });
  }
  markFileChanged(file, type) {
    const relPath = file.path;
    const existing = this.changedFiles.get(relPath);
    if (existing === "deleted") {
      return;
    }
    this.changedFiles.set(relPath, type);
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  markPathDeleted(relPath) {
    this.changedFiles.set(relPath, "deleted");
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  markRename(fromPath, toPath) {
    if (fromPath === toPath) return;
    this.pendingRenames.push({ from: fromPath, to: toPath });
    this.changedFiles.set(toPath, "modified");
    if (!this.isSyncing) {
      this.setStatusPending();
    }
  }
  getVaultRootPath() {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof import_obsidian4.FileSystemAdapter) {
      return adapter.getBasePath();
    }
    throw new Error("Vault Folder Sync works only on desktop with FileSystemAdapter.");
  }
  async triggerSync(forceFull, manual = false) {
    if (this.isSyncing) {
      if (manual) {
        new import_obsidian4.Notice("Vault Folder Sync: \u5DF2\u6709\u540C\u6B65\u4EFB\u52A1\u5728\u6267\u884C\u4E2D\u3002");
      }
      return;
    }
    this.isSyncing = true;
    try {
      const sourceRoot = this.getVaultRootPath();
      const enabledTargets = this.settings.targets.filter(
        (t) => t.enabled && t.path.trim().length > 0
      );
      if (enabledTargets.length === 0) {
        this.setStatusSynced();
        return;
      }
      this.setStatusSyncing();
      for (const target of enabledTargets) {
        const needsFull = forceFull || !await this.isInitialFullSyncMarked(target.path);
        if (needsFull) {
          await this.fullSyncTarget(sourceRoot, target);
        } else {
          await this.incrementalSyncTarget(sourceRoot, target);
        }
      }
      this.changedFiles.clear();
      this.pendingRenames = [];
      this.setStatusSynced();
    } catch (err) {
      console.error("Vault Folder Sync error:", err);
      if (manual) {
        new import_obsidian4.Notice("Vault Folder Sync: \u540C\u6B65\u5931\u8D25\uFF0C\u8BF7\u67E5\u770B\u63A7\u5236\u53F0\u65E5\u5FD7\u3002");
      }
    } finally {
      this.isSyncing = false;
    }
  }
  async isInitialFullSyncMarked(targetRoot) {
    const markerPath = this.getTargetMarkerPath(targetRoot);
    return this.pathExists(markerPath);
  }
  async fullSyncTarget(sourceRoot, target) {
    const targetRoot = target.path;
    await this.ensureDir(targetRoot);
    await this.copyDirectoryRecursive(sourceRoot, targetRoot);
    await this.removeExtraneousInTarget(sourceRoot, targetRoot);
    await this.writeInitialFullSyncMarker(targetRoot);
  }
  async incrementalSyncTarget(sourceRoot, target) {
    const targetRoot = target.path;
    await this.ensureDir(targetRoot);
    for (const rename of this.pendingRenames) {
      const fromAbs = getTargetAbsolutePath(
        targetRoot,
        rename.from,
        this.settings.filenameRules
      );
      const toAbs = getTargetAbsolutePath(
        targetRoot,
        rename.to,
        this.settings.filenameRules
      );
      try {
        await this.ensureDir(path5.dirname(toAbs));
        if (await this.pathExists(fromAbs)) {
          await fs4.promises.rename(fromAbs, toAbs);
        }
      } catch (err) {
        console.error("Vault Folder Sync rename error:", err);
      }
    }
    for (const [relPath, changeType] of this.changedFiles) {
      const sourceAbs = getSourceAbsolutePath(sourceRoot, relPath);
      const targetAbs = getTargetAbsolutePath(
        targetRoot,
        relPath,
        this.settings.filenameRules
      );
      try {
        if (changeType === "deleted") {
          await this.deletePathIfExists(targetAbs);
        } else {
          const sourceStat = await fs4.promises.stat(sourceAbs).catch(
            () => null
          );
          if (!sourceStat) {
            continue;
          }
          if (sourceStat.isDirectory()) {
            await this.ensureDir(targetAbs);
          } else {
            await this.ensureDir(path5.dirname(targetAbs));
            await this.copyFileWithMetadata(sourceAbs, targetAbs);
          }
        }
      } catch (err) {
        console.error(
          `Vault Folder Sync incremental error for ${relPath}:`,
          err
        );
      }
    }
  }
  async ensureDir(dirPath) {
    await fs4.promises.mkdir(dirPath, { recursive: true });
  }
  async pathExists(p) {
    try {
      await fs4.promises.access(p);
      return true;
    } catch {
      return false;
    }
  }
  async deletePathIfExists(p) {
    if (!await this.pathExists(p)) return;
    const stat = await fs4.promises.stat(p);
    if (stat.isDirectory()) {
      await fs4.promises.rm(p, { recursive: true, force: true });
    } else {
      await fs4.promises.unlink(p);
    }
  }
  async copyDirectoryRecursive(sourceDir, targetDir) {
    await this.ensureDir(targetDir);
    const entries = await fs4.promises.readdir(sourceDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const srcPath = path5.join(sourceDir, entry.name);
      const safeName = mapSegmentForward(
        entry.name,
        this.settings.filenameRules
      );
      const destPath = path5.join(targetDir, safeName);
      if (entry.isDirectory()) {
        await this.copyDirectoryRecursive(srcPath, destPath);
      } else if (entry.isFile()) {
        await this.ensureDir(path5.dirname(destPath));
        await this.copyFileWithMetadata(srcPath, destPath);
      }
    }
  }
  async verifyTargetsByMtime(sourceRoot, targets) {
    if (targets.length === 0) return;
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.setStatusSyncing();
    try {
      for (const target of targets) {
        const hasInitialFull = await this.isInitialFullSyncMarked(
          target.path
        );
        if (!hasInitialFull) continue;
        await this.verifyDirectoryByMtime(sourceRoot, target.path);
      }
      this.setStatusSynced();
    } catch (err) {
      console.error(
        "Vault Folder Sync: verifyTargetsByMtime error:",
        err
      );
    } finally {
      this.isSyncing = false;
    }
  }
  async verifyDirectoryByMtime(sourceDir, targetDir) {
    await this.ensureDir(targetDir);
    const entries = await fs4.promises.readdir(sourceDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const srcPath = path5.join(sourceDir, entry.name);
      const safeName = mapSegmentForward(
        entry.name,
        this.settings.filenameRules
      );
      const destPath = path5.join(targetDir, safeName);
      if (entry.isDirectory()) {
        await this.verifyDirectoryByMtime(srcPath, destPath);
      } else if (entry.isFile()) {
        const srcStat = await fs4.promises.stat(srcPath);
        const destStat = await fs4.promises.stat(destPath).catch(
          () => null
        );
        let needCopy = false;
        if (!destStat || !destStat.isFile()) {
          needCopy = true;
        } else {
          const diff2 = Math.abs(
            srcStat.mtimeMs - destStat.mtimeMs
          );
          if (diff2 > 1) {
            needCopy = true;
          }
        }
        if (needCopy) {
          await this.ensureDir(path5.dirname(destPath));
          await this.copyFileWithMetadata(srcPath, destPath);
        }
      }
    }
    const targetEntries = await fs4.promises.readdir(targetDir, {
      withFileTypes: true
    });
    for (const entry of targetEntries) {
      const targetPath = path5.join(targetDir, entry.name);
      const originalName = mapSegmentBackward(
        entry.name,
        this.settings.filenameRules
      );
      const sourcePath = path5.join(sourceDir, originalName);
      const sourceExists = await this.pathExists(sourcePath);
      if (sourceExists) continue;
      const isMarkerFile = entry.isFile() && entry.name === "vault-folder-sync.json" && path5.basename(targetDir) === ".obsidian";
      if (isMarkerFile) {
        continue;
      }
      await this.deletePathIfExists(targetPath);
    }
  }
  async copyFileWithMetadata(sourceFile, targetFile) {
    const stat = await fs4.promises.stat(sourceFile);
    await fs4.promises.copyFile(sourceFile, targetFile);
    try {
      await fs4.promises.utimes(
        targetFile,
        stat.atime,
        stat.mtime
      );
    } catch (err) {
      console.error("Vault Folder Sync: failed to preserve file times for", targetFile, err);
    }
  }
  async removeExtraneousInTarget(sourceDir, targetDir) {
    if (!await this.pathExists(targetDir)) return;
    const entries = await fs4.promises.readdir(targetDir, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const targetPath = path5.join(targetDir, entry.name);
      const originalName = mapSegmentBackward(
        entry.name,
        this.settings.filenameRules
      );
      const sourcePath = path5.join(sourceDir, originalName);
      const sourceExists = await this.pathExists(sourcePath);
      if (!sourceExists) {
        await this.deletePathIfExists(targetPath);
        continue;
      }
      if (entry.isDirectory()) {
        const srcStat = await fs4.promises.stat(sourcePath);
        if (srcStat.isDirectory()) {
          await this.removeExtraneousInTarget(sourcePath, targetPath);
        }
      }
    }
  }
  getTargetMarkerPath(targetRoot) {
    return path5.join(targetRoot, ".obsidian", "vault-folder-sync.json");
  }
  async writeInitialFullSyncMarker(targetRoot) {
    const markerPath = this.getTargetMarkerPath(targetRoot);
    await this.ensureDir(path5.dirname(markerPath));
    const content = JSON.stringify(
      {
        initialFullSyncDone: true,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      },
      null,
      2
    );
    await fs4.promises.writeFile(markerPath, content, "utf8");
  }
  async runReverseSyncOnce(sourceRoot) {
    const reverseTargets = this.settings.targets.filter(
      (t) => t.enabled && t.enableReverseSync && t.path.trim().length > 0
    );
    if (reverseTargets.length === 0) return;
    await runReverseSyncForTargets(
      this.app,
      sourceRoot,
      reverseTargets.map((t) => t.path)
    );
  }
  setStatusPending() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u25CF");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u5F85\u540C\u6B65");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u6709\u672A\u540C\u6B65\u7684\u4FEE\u6539\uFF0C\u7B49\u5F85\u4E0B\u4E00\u6B21\u540C\u6B65\u2026"
    );
  }
  setStatusSyncing() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u27F3");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u540C\u6B65\u4E2D");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u672A\u540C\u6B65\u6216\u6B63\u5728\u540C\u6B65\u4E2D\u2026"
    );
  }
  setStatusSynced() {
    if (!this.statusBarItem) return;
    this.statusBarItem.empty();
    const iconSpan = this.statusBarItem.createSpan();
    iconSpan.setText("\u2714");
    const textSpan = this.statusBarItem.createSpan();
    textSpan.setText(" \u5DF2\u540C\u6B65");
    this.statusBarItem.setAttr(
      "title",
      "Vault Folder Sync: \u4E0A\u6B21\u540C\u6B65\u5DF2\u5B8C\u6210\u3002"
    );
  }
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    if (!Array.isArray(this.settings.filenameRules) || this.settings.filenameRules.length === 0) {
      this.settings.filenameRules = DEFAULT_FILENAME_RULES.map((r) => ({
        ...r
      }));
    }
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var VaultFolderSyncSettingTab = class extends import_obsidian4.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Vault Folder Sync \u8BBE\u7F6E" });
    const rulesSection = containerEl.createEl("div");
    rulesSection.createEl("h3", { text: "\u540C\u6B65\u89C4\u5219\u6982\u89C8" });
    const forwardList = rulesSection.createEl("ul");
    forwardList.createEl("li", {
      text: "\u6B63\u5411\u540C\u6B65\uFF1A\u9996\u6B21\u6309\u9700\u5168\u91CF\u590D\u5236\uFF0C\u4E4B\u540E\u6309\u6587\u4EF6/\u76EE\u5F55\u53D8\u66F4\u548C\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u8FDB\u884C\u589E\u91CF\u540C\u6B65\uFF0C\u4FDD\u6301\u76EE\u6807\u76EE\u5F55\u4E0E\u5F53\u524D vault \u4E00\u81F4\u3002"
    });
    forwardList.createEl("li", {
      text: "\u542F\u52A8\u65F6\u4F1A\u989D\u5916\u6309\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u5168\u9762\u6821\u9A8C\u4E00\u6B21\uFF0C\u4FEE\u6B63\u9057\u6F0F\u7684\u589E\u91CF\u53D8\u66F4\uFF08\u5305\u542B\u65B0\u589E\u3001\u4FEE\u6539\u3001\u5220\u9664\uFF09\u3002"
    });
    const reverseListTitle = rulesSection.createEl("p", {
      text: "\u53CD\u5411\u540C\u6B65\uFF08\u53EF\u9009\uFF0C\u5BF9\u6BCF\u4E2A\u76EE\u6807\u5355\u72EC\u5F00\u542F\uFF09\uFF1A"
    });
    reverseListTitle.style.marginTop = "0.75em";
    const reverseList = rulesSection.createEl("ul");
    reverseList.createEl("li", {
      text: "\u76EE\u6807\u76EE\u5F55\u4E2D\u6587\u4EF6\u8F83\u65B0\u6216\u65B0\u589E\u65F6\uFF0C\u4F1A\u8986\u76D6/\u5199\u56DE\u5F53\u524D vault\uFF1B\u6E90\u6587\u4EF6\u8F83\u65B0\u65F6\u89C6\u4E3A\u51B2\u7A81\uFF0C\u4EC5\u63D0\u793A\u4E0D\u8986\u76D6\u3002"
    });
    reverseList.createEl("li", {
      text: "\u5220\u9664\u64CD\u4F5C\u57FA\u4E8E .obsidian/vault-folder-sync-deleted.json \u4E2D\u7684\u5220\u9664\u65F6\u95F4\uFF0C\u4E0E\u6E90\u6587\u4EF6\u6700\u540E\u4FEE\u6539\u65F6\u95F4\u6BD4\u8F83\u540E\u518D\u51B3\u5B9A\u662F\u5426\u540C\u6B65\u5220\u9664\u3002"
    });
    rulesSection.createEl("p", {
      text: "\u6CE8\u610F\uFF1A\u53CD\u5411\u540C\u6B65\u4EC5\u505A\u589E\u91CF\u68C0\u67E5\uFF0C\u4E0D\u4F1A\u8FDB\u884C\u5168\u91CF\u8986\u76D6\uFF0C\u8BF7\u8C28\u614E\u5F00\u542F\u3002"
    });
    new import_obsidian4.Setting(containerEl).setName("\u540C\u6B65\u95F4\u9694\uFF08\u79D2\uFF09").setDesc("\u5B9A\u65F6\u589E\u91CF\u540C\u6B65\u7684\u65F6\u95F4\u95F4\u9694\uFF0C\u9ED8\u8BA4 30 \u79D2\u3002").addText(
      (text) => text.setPlaceholder("30").setValue(
        String(this.plugin.settings.syncIntervalSeconds ?? 30)
      ).onChange(async (value) => {
        const num = Number(value);
        if (!Number.isNaN(num) && num > 0) {
          this.plugin.settings.syncIntervalSeconds = num;
          await this.plugin.saveSettings();
          new import_obsidian4.Notice(
            "Vault Folder Sync: \u540C\u6B65\u95F4\u9694\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u91CD\u542F\u63D2\u4EF6\u540E\u751F\u6548\u3002"
          );
        }
      })
    );
    containerEl.createEl("h3", { text: "\u540C\u6B65\u76EE\u6807\u76EE\u5F55" });
    this.plugin.settings.targets.forEach((target) => {
      const s = new import_obsidian4.Setting(containerEl).setName(target.path || "(\u672A\u8BBE\u7F6E\u8DEF\u5F84)").setDesc("\u5C06\u5F53\u524D vault \u540C\u6B65\u5230\u8BE5\u76EE\u5F55\u3002").addToggle((toggle) => {
        const wrapper = toggle.toggleEl.parentElement;
        toggle.setValue(target.enabled).setTooltip("\u542F\u7528\u6B63\u5411\u540C\u6B65\uFF08\u4ECE\u5F53\u524D vault \u540C\u6B65\u5230\u8BE5\u76EE\u5F55\uFF09").onChange(async (value) => {
          target.enabled = value;
          await this.plugin.saveSettings();
        });
        if (wrapper) {
          wrapper.style.display = "flex";
          wrapper.style.alignItems = "center";
          const label = wrapper.createSpan({ text: "\u6B63\u5411" });
          label.style.marginLeft = "0.25em";
          label.style.whiteSpace = "nowrap";
        }
      }).addToggle((toggle) => {
        const wrapper = toggle.toggleEl.parentElement;
        toggle.setValue(target.enableReverseSync ?? false).setTooltip("\u542F\u7528\u53CD\u5411\u540C\u6B65\uFF08\u4ECE\u8BE5\u76EE\u5F55\u540C\u6B65\u56DE\u5F53\u524D vault\uFF09").onChange(async (value) => {
          target.enableReverseSync = value;
          await this.plugin.saveSettings();
        });
        if (wrapper) {
          wrapper.style.display = "flex";
          wrapper.style.alignItems = "center";
          const label = wrapper.createSpan({ text: "\u53CD\u5411" });
          label.style.marginLeft = "0.25em";
          label.style.whiteSpace = "nowrap";
        }
      }).addText(
        (text) => text.setPlaceholder("\u8F93\u5165\u76EE\u6807\u76EE\u5F55\u7684\u7EDD\u5BF9\u8DEF\u5F84").setValue(target.path).onChange(async (value) => {
          target.path = value.trim();
          await this.plugin.saveSettings();
        })
      ).addExtraButton(
        (button) => button.setIcon("trash").setTooltip("\u5220\u9664\u8BE5\u76EE\u6807\u76EE\u5F55\u914D\u7F6E").onClick(async () => {
          this.plugin.settings.targets = this.plugin.settings.targets.filter(
            (t) => t.id !== target.id
          );
          await this.plugin.saveSettings();
          this.display();
        })
      );
      s.infoEl.style.whiteSpace = "pre-wrap";
    });
    containerEl.createEl("h4", { text: "\u65B0\u589E\u76EE\u6807\u76EE\u5F55" });
    let newPathValue = "";
    new import_obsidian4.Setting(containerEl).setName("\u76EE\u6807\u76EE\u5F55\u8DEF\u5F84").setDesc("\u8F93\u5165\u4E00\u4E2A\u65B0\u7684\u76EE\u6807\u76EE\u5F55\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u7528\u4E8E\u540C\u6B65\u672C vault\u3002").addText(
      (text) => text.setPlaceholder("/path/to/another/folder").onChange((value) => {
        newPathValue = value.trim();
      })
    ).addButton(
      (button) => button.setButtonText("\u6DFB\u52A0").onClick(async () => {
        if (!newPathValue) {
          new import_obsidian4.Notice("\u8BF7\u5148\u8F93\u5165\u76EE\u6807\u76EE\u5F55\u8DEF\u5F84\u3002");
          return;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.plugin.settings.targets.push({
          id,
          path: newPathValue,
          enabled: true,
          lastFullSyncDone: false
        });
        await this.plugin.saveSettings();
        newPathValue = "";
        this.display();
      })
    );
    createLogView(containerEl, this.app);
    containerEl.createEl("h3", { text: "Windows \u6587\u4EF6\u540D\u517C\u5BB9" });
    new import_obsidian4.Setting(containerEl).setName("\u6587\u4EF6\u540D\u5B57\u7B26\u66FF\u6362\u89C4\u5219").setDesc(
      "\u5728\u540C\u6B65\u5230\u76EE\u6807\u76EE\u5F55\u65F6\uFF0C\u5C06\u6587\u4EF6\u540D\u4E2D\u7684\u7279\u6B8A\u5B57\u7B26\u66FF\u6362\u4E3A Windows \u652F\u6301\u7684\u5B57\u7B26\uFF1B\u53CD\u5411\u540C\u6B65\u65F6\u4F1A\u81EA\u52A8\u53CD\u5411\u6620\u5C04\u3002\u4E0B\u9762\u6BCF\u4E00\u884C\u662F\u4E00\u6761\u89C4\u5219\uFF1A\u5DE6\u8FB9\u662F\u6E90\u5B57\u7B26\uFF0C\u53F3\u8FB9\u662F\u76EE\u6807\u5B57\u7B26\u3002"
    );
    const rulesContainer = containerEl.createEl("div");
    const renderRules = () => {
      rulesContainer.empty();
      this.plugin.settings.filenameRules.forEach((rule, index) => {
        const s = new import_obsidian4.Setting(rulesContainer).setName(`\u89C4\u5219 ${index + 1}`).setDesc("\u6E90\u5B57\u7B26 => \u76EE\u6807\u5B57\u7B26").addText(
          (text) => text.setPlaceholder("\u6E90\u5B57\u7B26\uFF0C\u4F8B\u5982 :").setValue(rule.from).onChange(async (value) => {
            this.plugin.settings.filenameRules[index].from = value;
            await this.plugin.saveSettings();
          })
        ).addText(
          (text) => text.setPlaceholder("\u76EE\u6807\u5B57\u7B26\uFF0C\u4F8B\u5982 \uFF1A").setValue(rule.to).onChange(async (value) => {
            this.plugin.settings.filenameRules[index].to = value;
            await this.plugin.saveSettings();
          })
        ).addExtraButton(
          (button) => button.setIcon("trash").setTooltip("\u5220\u9664\u8BE5\u89C4\u5219").onClick(async () => {
            this.plugin.settings.filenameRules.splice(
              index,
              1
            );
            await this.plugin.saveSettings();
            renderRules();
          })
        );
        s.infoEl.style.whiteSpace = "pre-wrap";
      });
      new import_obsidian4.Setting(rulesContainer).setName("\u65B0\u589E\u89C4\u5219").setDesc("\u6DFB\u52A0\u4E00\u6761\u65B0\u7684\u5B57\u7B26\u66FF\u6362\u89C4\u5219\u3002").addButton(
        (button) => button.setButtonText("\u6DFB\u52A0\u89C4\u5219").onClick(async () => {
          this.plugin.settings.filenameRules.push({
            from: "",
            to: ""
          });
          await this.plugin.saveSettings();
          renderRules();
        })
      ).addButton(
        (button) => button.setButtonText("\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u89C4\u5219").onClick(async () => {
          this.plugin.settings.filenameRules = DEFAULT_FILENAME_RULES.map((r) => ({ ...r }));
          await this.plugin.saveSettings();
          renderRules();
          new import_obsidian4.Notice(
            "Vault Folder Sync: \u5DF2\u91CD\u7F6E\u4E3A\u9ED8\u8BA4\u7684 Windows \u6587\u4EF6\u540D\u517C\u5BB9\u89C4\u5219\u3002"
          );
        })
      );
    };
    renderRules();
  }
};
