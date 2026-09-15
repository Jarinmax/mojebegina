// Mock data pro obrazovku "Historie objednávek".
// Žádné napojení na WooCommerce / backend — jen ukázková data.
// Datum a produkty první (nejnovější) objednávky odpovídají
// mockLastOrder v mock/customer.ts, aby "Objednat znovu" z dashboardu
// vedlo na konzistentní údaje.

export type OrderStatus = "Expedováno" | "Doručeno";

export type Order = {
  id: string;
  orderNumber: string;
  date: string;
  products: string;
  totalKc: number;
  status: OrderStatus;
};

export const mockOrders: Order[] = [
  {
    id: "posledni",
    orderNumber: "OBJ-2026-0142",
    date: "5. 9. 2026",
    products: "2× Begina Original, 1× Begina Bez cukru",
    totalKc: 890,
    status: "Expedováno",
  },
  {
    id: "obj-0107",
    orderNumber: "OBJ-2026-0107",
    date: "12. 8. 2026",
    products: "3× Begina Original",
    totalKc: 720,
    status: "Doručeno",
  },
  {
    id: "obj-0068",
    orderNumber: "OBJ-2026-0068",
    date: "3. 7. 2026",
    products: "1× Begina Original, 1× Begina Bez cukru, 1× Begina Limitovaná edice",
    totalKc: 950,
    status: "Doručeno",
  },
];
