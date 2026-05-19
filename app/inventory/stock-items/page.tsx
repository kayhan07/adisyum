import { redirect } from 'next/navigation';

export default function StockItemsPage() {
  redirect('/products?domain=stock_item');
}
