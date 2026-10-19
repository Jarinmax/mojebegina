// Historie objednávek zákaznické karty — sdílená pro zákazníka i admin náhled.
import PageHeader from "@/components/PageHeader";
import OrderCard from "@/components/OrderCard";
import type { Order } from "@/mock/customer";

export default function CustomerOrdersView({ orders }: { orders: Order[] }) {
  return (
    <>
      <PageHeader title="Historie objednávek" />
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
    </>
  );
}
