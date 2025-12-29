export type Item = {
  objectID: string;
  masterId: string;
  name: string;
  c_displayName: string;
  seoProductDesc: string;
  trueColor: string;
  color: string;
  subDept: Array<string>;
  brand: string;
  price: {
    min: number;
    max: number;
    discount: number;
  };
  onSale: boolean;
  orderable: boolean;
  rise: Array<string>;
  legShape: Array<string>;
  articleFit: Array<string>;
  inseam: Array<string>;
  length: Array<string>;
  fabric: Array<string>;
  style: Array<string>;
  neckline: Array<string>;
  sleeve: Array<string>;
  slug: string;
  sizeRun: Array<string>;
  shippableSizes: Array<string>;
  wash: Array<string>;
  warmth: Array<string>;
  activity: Array<string>;
  occasion: Array<string>;
  primaryCategoryId: string;
  feature: Array<string>;
  selectableColors: Array<{
    value: string;
    swatch: string;
    sizeRun: Array<string>;
    onSale: boolean;
    shippableSizes: Array<string>;
    colorIds: Record<string, Array<string>>;
    prices: Array<{ source: string; prices: Array<number> }>;
    refColor: string;
  }>;
};

export type APIResponse = {
  hits: Array<Item>;
};

export type IntermediateForm = {
  id: string;
  name: string;
  description: string;
  price: {
    min: number;
    max: number;
    discount: number;
  };
  onSale: boolean;
  orderable: boolean;
  about: {
    rise: Array<string>;
    legShape: Array<string>;
    articleFit: Array<string>;
    inseam: Array<string>;
    length: Array<string>;
    fabric: Array<string>;
    style: Array<string>;
    neckline: Array<string>;
    sleeve: Array<string>;
  };
  slug: string;
  colors: Array<{
    name: string;
    onSale: boolean;
    sizeRun: Array<string>;
    colorIds: Array<string>;
    images: Array<string>;
  }>;
};

export type ImageDownloadRecord = {
  id: string;
  product_id: string;
  variant_id: string;
};
