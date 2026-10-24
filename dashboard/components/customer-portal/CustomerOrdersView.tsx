// Historie objednávek zákaznické karty — sdílená pro zákazníka i admin náhled.
// Tlačítko „Zaplatit“ jen u zákazníka (showPaymentAction), v náhledu nikdy.
import PageHeader from "@/components/PageHeader";
import OrderCard from "@/components/OrderCard";
import type { Order } from "@/mock/customer";

export default function CustomerOrdersView({ orders, showPaymentAction = false }: { orders: Order[]; showPaymentAction?: boolean }) {
  return (
    <>
      <PageHeader title="Historie objednávek" />
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} showPaymentAction={showPaymentAction} />
      ))}
    </>
  );
}
