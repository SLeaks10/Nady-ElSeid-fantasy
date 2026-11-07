// Connects the league page to Firebase (Firestore database + Google sign-in).
// It provides the same small API the page was written against: claude.use('db') and claude.use('user').
(function () {
  'use strict';
  var ADMIN_EMAILS = ['homeisseif@gmail.com'];

  firebase.initializeApp(window.FIREBASE_CONFIG);
  var auth = firebase.auth();
  var fs = firebase.firestore();

  var ready = new Promise(function (resolve) {
    var stop = auth.onAuthStateChanged(function (u) { stop(); resolve(u); });
  });

  function fail(e) {
    if (e && e.code === 'permission-denied') e.code = 'permission_denied';
    throw e;
  }

  function docRef(path) {
    var r = fs.doc(path);
    return {
      id: r.id,
      get: function () { return r.get(); },
      set: function (d) { return r.set(d).catch(fail); },
      // Merges nested objects (e.g. adding one gameweek's team without touching the others)
      update: function (d) { return r.set(d, { merge: true }).catch(fail); },
      delete: function () { return r.delete().catch(fail); },
      onSnapshot: function (cb, err) { return r.onSnapshot(cb, err); }
    };
  }

  function colRef(path) {
    var c = fs.collection(path);
    return {
      add: function (d) { return c.add(d).catch(fail); },
      doc: function (id) { return docRef(path + '/' + id); },
      get: function () { return c.get(); },
      onSnapshot: function (cb, err) { return c.onSnapshot(cb, err); }
    };
  }

  var db = { doc: docRef, collection: colRef };

  function displayName(u) {
    return (u.displayName || (u.email || '').split('@')[0] || 'Player').slice(0, 40);
  }

  var user = {
    me: function () {
      return ready.then(function (u) {
        if (!u) return { id: null, name: '', isOwner: false };
        var name = displayName(u);
        fs.doc('profiles/' + u.uid).set({ name: name }, { merge: true }).catch(function () {});
        var email = (u.email || '').toLowerCase();
        return { id: u.uid, name: name, isOwner: !!(u.emailVerified && ADMIN_EMAILS.indexOf(email) >= 0) };
      });
    },
    profiles: function (ids) {
      var out = {};
      return Promise.all(ids.map(function (id) {
        return fs.doc('profiles/' + id).get().then(function (s) { if (s.exists) out[id] = s.data(); }).catch(function () {});
      })).then(function () { return out; });
    }
  };

  window.fantasyAuth = {
    signIn: function () {
      var p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return auth.signInWithPopup(p).then(function () { location.reload(); }).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          return auth.signInWithRedirect(p);
        }
        if (e && e.code === 'auth/popup-closed-by-user') return;
        throw e;
      });
    },
    signOut: function () { return auth.signOut().then(function () { location.reload(); }); },
    current: function () { return auth.currentUser; },
    // Google blocks sign-in inside apps like WhatsApp, Instagram and Facebook
    inAppBrowser: /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent || '')
  };

  window.claude = {
    use: function (name) {
      return ready.then(function () {
        if (name === 'db') return db;
        if (name === 'user') return user;
        return null;
      });
    }
  };
})();
