/**
 * Smart DOM observer:
 * - Runs callbacks only for matching selectors
 * - Deduplicates elements (runs once per element)
 * - Batches mutations using requestAnimationFrame
 */
 
function createSmartObserver(root = document.documentElement) {
    const registry = new Map(); // selector -> Set<{ callback, seen }>
    let scheduled = false;
    let pendingNodes = [];
    let observing = false;

    const observer = new MutationObserver((mutations) => {
        if (registry.size === 0) return;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    pendingNodes.push(node);
                }
            }
        }

        if (scheduled) return;
        scheduled = true;

        requestAnimationFrame(() => {
            scheduled = false;

            const nodes = pendingNodes;
            pendingNodes = [];

            for (const node of nodes) {
                processNode(node);
            }
        });
    });

    function ensureObserving() {
        if (observing) return;
        observer.observe(root, {
            childList: true,
            subtree: true
        });
        observing = true;
    }

    function stopIfIdle() {
        if (registry.size > 0 || !observing) return;
        observer.disconnect();
        observing = false;
        pendingNodes = [];
        scheduled = false;
    }

    function processNode(node) {
        if (registry.size === 0) return;
        for (const [selector, entries] of registry.entries()) {
            for (const entry of entries) {
                const { callback, seen } = entry;

                // Direct match
                if (node.matches?.(selector) && !seen.has(node)) {
                    seen.add(node);
                    safeCall(callback, node);
                }

                // Descendants
                const matches = node.querySelectorAll?.(selector);
                if (matches && matches.length) {
                    for (const el of matches) {
                        if (seen.has(el)) continue;
                        seen.add(el);
                        safeCall(callback, el);
                    }
                }
            }
        }
    }

    function safeCall(cb, el) {
        try {
            cb(el);
        } catch (e) {
            console.error("SmartObserver error:", e);
        }
    }

    function observe(selector, callback) {
        if (!registry.has(selector)) registry.set(selector, new Set());
        ensureObserving();

        const entry = {
            callback,
            seen: new WeakSet()
        };
        registry.get(selector).add(entry);

        // Run immediately for existing elements within the observed root
        root.querySelectorAll(selector).forEach(el => {
            if (!entry.seen.has(el)) {
                entry.seen.add(el);
                safeCall(callback, el);
            }
        });

        return () => {
            const entries = registry.get(selector);
            if (!entries) return;
            entries.delete(entry);
            if (entries.size === 0) registry.delete(selector);
            stopIfIdle();
        };
    }

    return {
        observe,
        disconnect: () => {
            registry.clear();
            observer.disconnect();
            observing = false;
            pendingNodes = [];
            scheduled = false;
        }
    };
}
/** Shared singleton observer for all modules */
const observer = createSmartObserver();

/**
 * Ember Hook
 */

const EmberHook = {
  _rules: [],
  _installed: false,
  _wrappedMark: Symbol('SnoozeEmberWrapped'),
  _appliedRulesKey: '__snoozeAppliedRules',

  install(context) {
    if (this._installed) {
      console.warn('[EmberHook] Already installed');
      return;
    }
    this._installed = true;

    context.rcp.postInit('rcp-fe-ember-libs', (api) => {
      const emberLibs = api;
      if (!emberLibs || typeof emberLibs.getEmber !== 'function') {
        console.warn('[EmberHook] rcp-fe-ember-libs has no getEmber');
        return;
      }

      const target = emberLibs;
      if (target[this._wrappedMark]) {
        return;
      }

      const originalGetEmber = emberLibs.getEmber.bind(emberLibs);
      emberLibs.getEmber = function(...args) {
        const p = originalGetEmber(...args);
        return Promise.resolve(p).then(Ember => {
          try {
            this._hookComponentExtend(Ember);
            this._hookServiceExtend(Ember);
          } catch (e) {
            console.warn('[EmberHook] hookComponentExtend error:', e);
          }
          return Ember;
        });
      }.bind(this);

      target[this._wrappedMark] = true;
    }, true);
  },

  _wrapMethod(target, name, replacement) {
    const fn = target[name];
    if (typeof fn !== 'function') return false;

    const wrappedSet = (target[this._wrappedMark] ??= new Set());
    if (wrappedSet.has(name)) return false;

    const original = fn;
    target[name] = function(...args) {
      const caller = (...callArgs) => original.apply(this, callArgs);
      return replacement.call(this, caller, args);
    };

    wrappedSet.add(name);
    return true;
  },

  _extractClassNames(args) {
    const collected = [];
    for (const a of args) {
      if (a && typeof a === 'object') {
        const cn = a.classNames;
        if (Array.isArray(cn)) {
          for (const c of cn) {
            if (typeof c === 'string') collected.push(c);
          }
        }
      }
    }
    return collected;
  },

  _applyRuleToClass(Ember, klass, extendArgs, rule) {
    let cur = klass;

    if (rule.mixin) {
      try {
        const mixinObj = rule.mixin(Ember, extendArgs);
        cur = cur.extend(mixinObj);
      } catch (e) {
        console.warn('[EmberHook] mixin failed:', rule.name, e);
      }
    }

    if (rule.wraps?.length) {
      try {
        const proto = cur.proto();

        const applied = (proto[this._appliedRulesKey] ??= new Set());
        if (!applied.has(rule.name)) {
          for (const w of rule.wraps) {
            this._wrapMethod(proto, w.name, w.replacement);
          }
          applied.add(rule.name);
          proto[this._appliedRulesKey] = applied;
        }
      } catch (e) {
        console.warn('[EmberHook] wraps failed:', rule.name, e);
      }
    }

    return cur;
  },

  _hookComponentExtend(Ember) {
    const Component = Ember.Component;
    if (!Component || typeof Component.extend !== 'function') {
      console.warn('[EmberHook] Ember.Component.extend not found');
      return;
    }

    const target = Component;
    if (target[this._wrappedMark]) {
      return;
    }

    const originalExtend = Component.extend.bind(Component);
    Component.extend = function(...args) {
      let klass = originalExtend(...args);

      if (this._rules.length > 0) {
        for (const rule of this._rules) {
          if (rule.type === 'service') continue;
          const m = rule.matcher;
          let matched = false;

          if (typeof m === 'function') {
            try {
              matched = m(args);
            } catch (e) {
              matched = false;
            }
          } else if (m === '*') {
            matched = true;
          } else {
            const classNames = this._extractClassNames(args);
            matched = classNames.includes(m);
          }

          if (matched) {
            klass = this._applyRuleToClass(Ember, klass, args, rule);
          }
        }
      }

      return klass;
    }.bind(this);

    target[this._wrappedMark] = true;
  },

  _hookServiceExtend(Ember) {
    const Service = Ember.Service;
    if (!Service || typeof Service.extend !== 'function') return;

    const target = Service;
    if (target[this._wrappedMark]) return;

    const originalExtend = Service.extend.bind(Service);
    Service.extend = function(...args) {
      let klass = originalExtend(...args);

      if (this._rules.length > 0) {
        for (const rule of this._rules) {
          if (rule.type !== 'service') continue;
          const m = rule.matcher;
          let matched = false;

          if (typeof m === 'function') {
            try { matched = m(args); } catch (e) { matched = false; }
          } else if (m === '*') {
            matched = true;
          } else {
            const classNames = this._extractClassNames(args);
            matched = classNames.includes(m);
          }

          if (matched) {
            klass = this._applyRuleToClass(Ember, klass, args, rule);
          }
        }
      }

      return klass;
    }.bind(this);

    target[this._wrappedMark] = true;
  },

  registerRule(rule) {
    const i = this._rules.findIndex(r => r.name === rule.name);
    if (i >= 0) {
      this._rules[i] = rule;
    } else {
      this._rules.push(rule);
    }
  },

  getRulesCount() {
    return this._rules.length;
  },
};
window.SnoozeEmberHook = EmberHook;


// Serialize a request body for LCU HTTP methods.
// Plain objects are JSON-stringified. Strings are passed through as-is,
// allowing callers to send pre-serialized payloads (e.g. the LCDS invoke endpoint).
function serializeBody(body) {
    if (body === undefined || body === null) return undefined;
    return typeof body === 'string' ? body : JSON.stringify(body);
}

// LCU
const LCU = {
  _ctx: null,
  _listeners: new Map(),
  _uris: new Set(),
  _subscribed: new Set(),
  _subscriptions: new Map(),

  bind(ctx) {
    if (this._ctx && this._ctx !== ctx) {
      this._subscriptions.forEach((_, uri) => this._disconnectUri(uri));
      this._subscribed.clear();
      this._subscriptions.clear();
    }
    this._ctx = ctx;
    window.LCU = this;
    console.log('[LCU] bindContext');
    this._uris.forEach(u => this._subscribe(u));
  },

  async get(url) {
    const r = await fetch(url.startsWith('/') ? url : '/' + url);
    if (!r.ok) throw new Error(r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },

  async post(url, body, options = {}) {
      const {
          headers = {},
          raw = false
      } = options;

      const finalHeaders = raw
           ? headers
           : {
          'Content-Type': 'application/json',
          ...headers
      };

      const r = await fetch(url.startsWith('/') ? url : '/' + url, {
          method: 'POST',
          headers: finalHeaders,
          body: raw ? body : serializeBody(body)
      });

    if (!r.ok) throw new Error(r.status);

    const t = await r.text();
    return t ? JSON.parse(t) : null;
	},

  async put(url, body) {
    const r = await fetch(url.startsWith('/') ? url : '/' + url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: serializeBody(body)
    });
    if (!r.ok) throw new Error(r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },

  async patch(url, body) {
    const r = await fetch(url.startsWith('/') ? url : '/' + url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: serializeBody(body)
    });
    if (!r.ok) throw new Error(r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  },

  observe(uri, cb) {
    if (!this._listeners.has(uri)) this._listeners.set(uri, new Set());
    this._listeners.get(uri).add(cb);
    this._uris.add(uri);
    if (this._ctx?.socket) this._subscribe(uri);
    return () => {
      const listeners = this._listeners.get(uri);
      if (!listeners) return;
      listeners.delete(cb);
      if (listeners.size === 0) {
        this._listeners.delete(uri);
        this._uris.delete(uri);
        this._disconnectUri(uri);
      }
    };
  },

  _subscribe(uri) {
    if (!this._ctx?.socket) return;
    if (this._subscribed.has(uri)) return;
    this._subscribed.add(uri);
    const ctx = this._ctx;
    const listener = (data) => {
      if (this._ctx !== ctx) return;
      (this._listeners.get(uri) || []).forEach(cb => cb(data));
    };
    const subscription = ctx.socket.observe(uri, listener);
    this._subscriptions.set(uri, { ctx, listener, subscription });
  },

  _disconnectUri(uri) {
    const sub = this._subscriptions.get(uri);
    if (!sub) return;

    try {
      if (sub.subscription && typeof sub.subscription.disconnect === 'function') {
        sub.subscription.disconnect();
      } else if (typeof sub.subscription === 'function') {
        sub.subscription();
      } else if (sub.ctx?.socket?.disconnect) {
        sub.ctx.socket.disconnect(uri, sub.listener);
      }
    } catch (e) {}

    this._subscriptions.delete(uri);
    this._subscribed.delete(uri);
  }
};

/**
 * Settings Utils
 */
function settingsUtils(context, pluginConfig) {
  if (window.SnoozeManager && window.SnoozeManager.__isLoader) return;
  EmberHook.install(context);

  const strings = {
    'snooze_plugins':         'Plugins',
    'snooze_plugins_capital': 'PLUGINS',
    [pluginConfig.titleKey]:         pluginConfig.titleName,
    [pluginConfig.capitalTitleKey]:  pluginConfig.capitalTitleName
  };

  context.rcp.postInit("rcp-fe-lol-settings", async (rcp) => {
    const em = await window.__SM_EMBER.getEmber();

    let pluginGroup = rcp._modalManager._registeredCategoryGroups.find(g => g.name === "plugins");
    if (!pluginGroup) {
      pluginGroup = { name: "plugins", titleKey: "snooze_plugins", capitalTitleKey: "snooze_plugins_capital", categories: [] };
      rcp._modalManager._registeredCategoryGroups.splice(1, 0, pluginGroup);
    }

    if (!pluginGroup.categories.some(c => c.name === pluginConfig.name)) {
      pluginGroup.categories.push({
        name: pluginConfig.name,
        titleKey: pluginConfig.titleKey,
        routeName: pluginConfig.name,
        group: pluginGroup,
        computeds: em.Object.create({ disabled: false }),
        isEnabled: () => true
      });
    }

    rcp._modalManager._refreshCategoryGroups();
  });

  context.rcp.postInit("rcp-fe-ember-libs", async (rcp) => {
    window.__SM_EMBER = rcp;
    const em = await rcp.getEmber();

    const nativeExtend = em.Router.extend;
    em.Router.extend = function() {
      const patchedRouter = nativeExtend.apply(this, arguments);
      patchedRouter.map(function() { this.route(pluginConfig.name); });
      return patchedRouter;
    };

    const appFactory = await rcp.getEmberApplicationFactory();
    const nativeBuilder = appFactory.factoryDefinitionBuilder;
    appFactory.factoryDefinitionBuilder = function() {
      const def = nativeBuilder.apply(this, arguments);
      const nativeBuild = def.build;
      def.build = function() {
        if (this.getName() === "rcp-fe-lol-settings") {
          this.addTemplate(
            pluginConfig.name,
            em.HTMLBars.template({
              id: pluginConfig.name,
              block: JSON.stringify({
                statements: [
                  ["open-element", "lol-uikit-scrollable", []],
                  ["static-attr", "class", pluginConfig.class],
                  ["flush-element"],
                  ["close-element"]
                ],
                locals: [], named: [], yields: [], blocks: [], hasPartials: false
              }),
              meta: {}
            })
          );
        }
        return nativeBuild.apply(this, arguments);
      };
      return def;
    };
  });

  context.rcp.postInit("rcp-fe-lol-l10n", async (rcp) => {
    const l10n = rcp.tra();
    const nativeGet = l10n.__proto__.get;
    l10n.__proto__.get = function(key) {
      return strings[key] !== undefined ? strings[key] : nativeGet.call(this, key);
    };
  });

  if (LCU && !LCU._ctx) LCU.bind(context);
}

// Shared Assets & Match History Helpers

const Assets = {
  champs: {}, items: {}, spells: {}, perks: {}, queues: [],
  _initPromise: null,
  _initialized: false,
  async init() {
    if (!LCU) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        const [c, i, s, p, ps, q] = await Promise.all([
          LCU.get('/lol-game-data/assets/v1/champion-summary.json').catch(()=>[]),
          LCU.get('/lol-game-data/assets/v1/items.json').catch(()=>[]),
          LCU.get('/lol-game-data/assets/v1/summoner-spells.json').catch(()=>[]),
          LCU.get('/lol-game-data/assets/v1/perks.json').catch(()=>[]),
          LCU.get('/lol-game-data/assets/v1/perkstyles.json').catch(()=>({styles:[]})),
          LCU.get('/lol-game-queues/v1/queues').catch(()=>[])
        ]);
        if (Array.isArray(c) && c.length > 0) c.forEach(x => this.champs[x.id] = x);
        if (Array.isArray(i) && i.length > 0) i.forEach(x => this.items[x.id] = x);
        if (Array.isArray(s) && s.length > 0) s.forEach(x => this.spells[x.id] = x);
        if (Array.isArray(p) && p.length > 0) p.forEach(x => this.perks[x.id] = x);
        if (ps && Array.isArray(ps.styles) && ps.styles.length > 0) ps.styles.forEach(x => this.perks[x.id] = x);
        if (Array.isArray(q) && q.length > 0) {
          this.queues = q.filter(x => x.name && x.id).map(x => ({
            id: x.id, name: x.shortName || x.name, tag: 'q_' + x.id
          })).sort((a, b) => a.name.localeCompare(b.name));
        }
        
        this._initialized = true;

        if (this.queues.length === 0 || Object.keys(this.champs).length === 0) {
          this._initPromise = null;
          this._initialized = false;
        }
      } catch (e) {
        this._initPromise = null;
        this._initialized = false;
      }
    })();

    return this._initPromise;
  },
  getIcon(type, id) {
    if (!id || id <= 0) return '';
    const obj = this[type][id];
    let path = obj?.iconPath || obj?.squarePortraitPath || '';
    if (path) path = path.replace('/lol-game-data/assets/', '/lol-game-data/assets/'); 
    return path;
  }
};

let sgpContextCache = null;
let sgpContextCacheExpiresAt = 0;
let sgpContextPromise = null;

async function getSgpContext() {
    const now = Date.now();
    if (sgpContextCache && now < sgpContextCacheExpiresAt) return sgpContextCache;
    if (sgpContextPromise) return sgpContextPromise;

    sgpContextPromise = (async () => {
    const entToken = await LCU.get('/entitlements/v1/token');
    let serverCode = 'EUW';
    if (entToken && entToken.issuer) {
      const externalMatch = entToken.issuer.match(/https?:\/\/([a-z0-9]+)-[a-z0-9]+\.(?:lol\.)?sgp\.pvp\.net/);
      if (externalMatch) serverCode = externalMatch[1].toUpperCase();
    }
    if (serverCode === 'EUW1') serverCode = 'EUW';
    if (serverCode === 'NA1' || serverCode === 'NA') serverCode = 'NA1';

    const SGP_SERVERS = {
      TW2: 'https://apse1-red.pp.sgp.pvp.net', SG2: 'https://apse1-red.pp.sgp.pvp.net',
      PH2: 'https://apse1-red.pp.sgp.pvp.net', VN2: 'https://apse1-red.pp.sgp.pvp.net',
      TH2: 'https://apse1-red.pp.sgp.pvp.net', JP1: 'https://apne1-red.pp.sgp.pvp.net',
      KR:  'https://apne1-red.pp.sgp.pvp.net', NA1: 'https://usw2-red.pp.sgp.pvp.net',
      BR1: 'https://usw2-red.pp.sgp.pvp.net', LA1: 'https://usw2-red.pp.sgp.pvp.net',
      LA2: 'https://usw2-red.pp.sgp.pvp.net', OC1: 'https://apse1-red.pp.sgp.pvp.net',
      EUW: 'https://euc1-red.pp.sgp.pvp.net', TR1: 'https://euc1-red.pp.sgp.pvp.net',
      RU:  'https://euc1-red.pp.sgp.pvp.net', PBE: 'https://usw2-red.pp.sgp.pvp.net'
    };

    let sgpBase = SGP_SERVERS[serverCode];
    if (!sgpBase && entToken && entToken.issuer && entToken.issuer.includes('.qq.com')) {
      const tencentMatch = entToken.issuer.match(/https?:\/\/([a-z0-9]+)(?:-[a-z0-9]+)*\.lol\.qq\.com/);
      if (tencentMatch) {
        const tCode = tencentMatch[1];
        if (tCode.startsWith('hn')) sgpBase = `https://${tCode}-k8s-sgp.lol.qq.com:21019`;
        else sgpBase = `https://${tCode}-sgp.lol.qq.com:21019`;
      }
    }
    if (!sgpBase) sgpBase = 'https://euc1-red.pp.sgp.pvp.net';

    sgpContextCache = { accessToken: entToken.accessToken, sgpBase };
    sgpContextCacheExpiresAt = now + 5 * 60 * 1000;
    return sgpContextCache;
    })();

    try {
        return await sgpContextPromise;
    } finally {
        sgpContextPromise = null;
    }
}

async function getSgpMatchHistory(puuid, startIndex = 0, count = 15, tag = '') {
    if (!LCU) return null;
    try {
        const { accessToken, sgpBase } = await getSgpContext();

        let url = `${sgpBase}/match-history-query/v1/products/lol/player/${puuid}/SUMMARY?startIndex=${startIndex}&count=${count}`;
        if (tag) url += `&tag=${tag}`;

        const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}`, 'User-Agent': 'LeagueOfLegendsClient' } });
        if (!resp.ok) throw new Error('SGP Error: ' + resp.status);
        return resp.json();
    } catch(err) {
        console.error('SGP Match History Error:', err);
        return null;
    }
}

/**
 * Fetch Hook (Interception)
 */
const FetchHook = {
    _installed: false,
    _reqHooks: new Map(),
    _resHooks: new Map(),

    install() {
        if (this._installed) return;
        this._installed = true;

        const originalFetch = window.fetch;
        window.fetch = async (input, init) => {
            let currentInput = input;
            let currentInit = init;
            const urlStr = (input instanceof Request) ? input.url : input.toString();

            if (this._reqHooks.size > 0) {
                for (const [pattern, callbacks] of this._reqHooks.entries()) {
                    const matched = pattern instanceof RegExp ? pattern.test(urlStr) : urlStr.includes(pattern);
                    if (matched) {
                        for (const cb of callbacks) {
                            cb(currentInput, currentInit);
                        }
                    }
                }
            }

            try {
                const response = await originalFetch(currentInput, currentInit);
                
                let hooksToRun = [];
                for (const [pattern, callbacks] of this._resHooks.entries()) {
                    const matched = pattern instanceof RegExp ? pattern.test(urlStr) : urlStr.includes(pattern);
                    if (matched) {
                        hooksToRun.push(...callbacks);
                    }
                }

                if (hooksToRun.length > 0) {
                    const originalText = response.text.bind(response);
                    response.text = async () => {
                        let text = await originalText();
                        for (const cb of hooksToRun) {
                            text = cb(text) ?? text;
                        }
                        return text;
                    };
                    response.json = async () => {
                        let text = await response.text();
                        return JSON.parse(text);
                    };
                }

                return response;
            } catch (e) {
                throw e;
            }
        };
    },

    hookReq(pattern, callback) {
        this.install();
        if (!this._reqHooks.has(pattern)) this._reqHooks.set(pattern, []);
        this._reqHooks.get(pattern).push(callback);
    },

    hookRes(pattern, callback) {
        this.install();
        if (!this._resHooks.has(pattern)) this._resHooks.set(pattern, []);
        this._resHooks.get(pattern).push(callback);
    }
};

/**
 * XHR Hook (Interception)
 */
const XhrHook = {
    _installed: false,
    _reqHooks: new Map(),
    _resHooks: new Map(),

    install() {
        if (this._installed) return;
        this._installed = true;

        const originalOpen = XMLHttpRequest.prototype.open;
        const self = this;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            const urlStr = url.toString();
            this.__urlStr = urlStr;
            this.__method = method;

            let matchedPre = [];
            let matchedPost = [];

            for (const [pattern, callbacks] of self._reqHooks.entries()) {
                if (pattern instanceof RegExp ? pattern.test(urlStr) : urlStr.includes(pattern)) {
                    matchedPre.push(...callbacks);
                }
            }

            for (const [pattern, callbacks] of self._resHooks.entries()) {
                if (pattern instanceof RegExp ? pattern.test(urlStr) : urlStr.includes(pattern)) {
                    matchedPost.push(...callbacks);
                }
            }

            if (matchedPre.length > 0 || matchedPost.length > 0) {
                const originalSend = this.send;
                
                this.send = function(body) {
                    let currentBody = body;
                    
                    for (const cb of matchedPre) {
                        currentBody = cb(this.__method, this.__urlStr, this, currentBody) ?? currentBody;
                    }

                    if (matchedPost.length > 0) {
                        let originalOnReadyStateChange = this.onreadystatechange;
                        this.onreadystatechange = function(ev) {
                            if (this.readyState === 4) {
                                if (this.responseType === '' || this.responseType === 'text') {
                                    let modifiedText = this.responseText;
                                    for (const cb of matchedPost) {
                                        modifiedText = cb(this.__method, this.__urlStr, this, modifiedText) ?? modifiedText;
                                    }
                                    if (modifiedText !== this.responseText) {
                                        Object.defineProperty(this, 'responseText', {
                                            writable: true,
                                            value: modifiedText
                                        });
                                        if (this.responseType === '') {
                                            Object.defineProperty(this, 'response', {
                                                writable: true,
                                                value: modifiedText
                                            });
                                        }
                                    }
                                }
                            }
                            if (originalOnReadyStateChange) {
                                return originalOnReadyStateChange.apply(this, arguments);
                            }
                        };
                    }

                    originalSend.call(this, currentBody);
                };
            }

            originalOpen.call(this, method, urlStr, ...rest);
        };
    },

    hookReq(pattern, callback) {
        this.install();
        if (!this._reqHooks.has(pattern)) this._reqHooks.set(pattern, []);
        this._reqHooks.get(pattern).push(callback);
    },

    hookRes(pattern, callback) {
        this.install();
        if (!this._resHooks.has(pattern)) this._resHooks.set(pattern, []);
        this._resHooks.get(pattern).push(callback);
    }
};

/**
 * WebSocket Mutation Hook
 */
const WSHook = {
    _installed: false,
    _hooks: new Map(),

    install(context) {
        if (this._installed || !context?.socket?._dispatcher?.publish) return;
        this._installed = true;

        const dispatcher = context.socket._dispatcher;
        const originalPublish = dispatcher.publish.bind(dispatcher);

        dispatcher.publish = (endpoint, payload) => {
            let currentPayload = payload;

            for (const [pattern, callbacks] of this._hooks.entries()) {
                const matched = pattern instanceof RegExp ? pattern.test(endpoint) : endpoint.includes(pattern);
                if (matched) {
                    for (const cb of callbacks) {
                        currentPayload = cb(endpoint, currentPayload) ?? currentPayload;
                    }
                }
            }

            if (currentPayload !== null && currentPayload !== undefined) {
                originalPublish(endpoint, currentPayload);
            }
        };
    },

    hook(pattern, callback) {
        if (!this._hooks.has(pattern)) this._hooks.set(pattern, []);
        this._hooks.get(pattern).push(callback);
    }
};

const Store = {
    MAIN_KEY: 'Snooze-Store',
    _cache: null,

    _load() {
        if (this._cache) return this._cache;
        
        // Migrate data from previous temporary name 'Snooze-Modules' to 'Snooze-Store'
        if (window.DataStore.has('Snooze-Modules')) {
            const oldData = window.DataStore.get('Snooze-Modules');
            window.DataStore.set(this.MAIN_KEY, oldData);
            window.DataStore.remove('Snooze-Modules');
        }

        const data = window.DataStore.get(this.MAIN_KEY);
        this._cache = (data && typeof data === 'object') ? data : { schemaVersion: 0 };
        
        if (this._cache.schemaVersion === undefined) {
            this._cache.schemaVersion = 0;
        }

        return this._cache;
    },

    _save() {
        window.DataStore.set(this.MAIN_KEY, this._cache);
    },

    getSchemaVersion() {
        const data = this._load();
        return data.schemaVersion || 0;
    },

    get(moduleName, key, fallback) {
        const data = this._load();
        if (!data[moduleName]) return fallback;
        const val = data[moduleName][key];
        return val !== undefined ? val : fallback;
    },

    set(moduleName, key, value) {
        const data = this._load();
        if (!data[moduleName]) data[moduleName] = {};
        data[moduleName][key] = value;
        this._save();
    },

    remove(moduleName, key) {
        const data = this._load();
        if (data[moduleName] && data[moduleName][key] !== undefined) {
            delete data[moduleName][key];
            if (Object.keys(data[moduleName]).length === 0) {
                delete data[moduleName];
            }
            this._save();
        }
    },

    removeModule(moduleName) {
        const data = this._load();
        if (data[moduleName] !== undefined) {
            delete data[moduleName];
            this._save();
        }
    },

    migrateLegacyKeys(mapping, moduleVersion = 1) {
        const data = this._load();
        
        let migrated = false;

        for (const [oldKey, target] of Object.entries(mapping)) {
            if (!data[target.module]) data[target.module] = {};
            
            // Skip if this specific module has already been migrated to the requested version
            if (data[target.module].schemaVersion >= moduleVersion) continue;

            if (window.DataStore.has(oldKey)) {
                let oldVal = window.DataStore.get(oldKey);
                if (typeof oldVal === "string" && (oldVal.startsWith("{") || oldVal.startsWith("["))) {
                    try { oldVal = JSON.parse(oldVal); } catch (e) {}
                }
                
                data[target.module][target.key] = oldVal;
                window.DataStore.remove(oldKey);
                migrated = true;
            }
        }

        // Mark the modules as migrated to the requested version
        for (const target of Object.values(mapping)) {
            if (data[target.module]) {
                if ((data[target.module].schemaVersion || 0) < moduleVersion) {
                    data[target.module].schemaVersion = moduleVersion;
                    migrated = true;
                }
            }
        }

        if (migrated) {
            this._save();
        }
    }
};

export const Utils = {
    DOM: { createSmartObserver, observer },
    Hooks: { Ember: EmberHook, Fetch: FetchHook, Xhr: XhrHook, WS: WSHook },
    LCU,
    Store,
    Settings: { inject: settingsUtils },
    GameData: { Assets, getSgpContext, getSgpMatchHistory }
};
export default Utils;
