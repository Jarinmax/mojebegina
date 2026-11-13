// Jarda — upozornění na naplánovaný hovor 1.0. Minimální service worker,
// jen pro Web Push (žádný offline cache/PWA — to tahle fáze neřeší).
// requireInteraction + vibrace: "co nejsilnější možné" upozornění, jak bylo
// schváleno (reálné omezení: prohlížeč nikdy nesmí obejít tichý režim/
// Nerušit telefonu — to umí jen nativní appka se speciálním oprávněním).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Begina", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Begina";
  const options = {
    body: data.body || "",
    icon: "/logo-begina-mark.png",
    badge: "/logo-begina-mark.png",
    vibrate: [300, 150, 300, 150, 300, 150, 600],
    requireInteraction: true,
    tag: "jarda-call-reminder",
    data: { url: data.url || "/prace" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/prace";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
