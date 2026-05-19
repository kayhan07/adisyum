import { redirect } from 'next/navigation';

export default function SaleProductsPage() {
  redirect('/products?domain=sale_product');
}
