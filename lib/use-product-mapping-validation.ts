import { useCallback } from 'react';
import { useProductMappingStore } from './pos-mapping-store';

interface ProductMappingValidation {
  is_mapped: boolean;
  is_valid: boolean;
  is_verified: boolean;
  mapping?: any;
  errors?: string[];
}

export function useProductMappingValidation() {
  const { addError, addWarning, removeError, clearErrors, clearWarnings } =
    useProductMappingStore();

  /**
   * Validate a product before adding to order
   */
  const validateProduct = useCallback(
    async (productId: string, productName: string): Promise<boolean> => {
      try {
        const response = await fetch(`/api/v1/products/${productId}/mapping`);

        if (!response.ok) {
          addError({
            productId,
            productName,
            message: `${productName} mappings not found`,
            type: 'missing',
          });
          return false;
        }

        const validation: ProductMappingValidation = await response.json();

        // Remove any previous errors for this product
        removeError(productId);

        if (!validation.is_mapped) {
          addError({
            productId,
            productName,
            message: `${productName} has not been mapped to POS. You must map all products before accepting orders.`,
            type: 'missing',
          });
          return false;
        }

        if (!validation.is_valid) {
          addError({
            productId,
            productName,
            message: `${productName} mapping is incomplete: ${
              validation.errors?.join(', ') || 'Invalid mapping'
            }`,
            type: 'invalid',
          });
          return false;
        }

        if (!validation.is_verified) {
          addWarning(
            `⚠️ ${productName} mapping has not been verified. Please verify it before confirming the order.`
          );
        }

        return true;
      } catch {
        addError({
          productId,
          productName,
          message: 'Error validating product mapping',
          type: 'invalid',
        });
        return false;
      }
    },
    [addError, addWarning, removeError]
  );

  /**
   * Validate multiple products (for order validation)
   */
  const validateOrder = useCallback(
    async (items: Array<{ product_id: string; product_name: string }>): Promise<boolean> => {
      clearErrors();
      clearWarnings();

      const validations = await Promise.all(
        items.map((item) => validateProduct(item.product_id, item.product_name))
      );

      return validations.every((v) => v === true);
    },
    [validateProduct, clearErrors, clearWarnings]
  );

  /**
   * Get coverage statistics
   */
  const getCoverageStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/product-mappings/coverage');
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // ignore and fallback to null
    }
    return null;
  }, []);

  return {
    validateProduct,
    validateOrder,
    getCoverageStatus,
  };
}
