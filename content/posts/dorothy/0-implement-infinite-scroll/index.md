+++
date = '2025-10-15T01:40:11+09:00'
tags=["Dorothy","개인프로젝트", "무한스크롤"]
categories=["개인프로젝트", "Dorothy"]
title = '[개인 프로젝트] 0. 무한 스크롤 구현하기'
+++

![infinity scroll 구현 이미지](images/infinite.gif)

IntersectionObserver와 tanstack query의 useSuspenseInfiniteQuery를 사용해서 무한 스크롤을 구현해보았습니다.

# API 쿼리 함수 만들기

DummyJSON의 products를 뿌려주기 위해, ky를 사용한 쿼리 함수를 만들어주었습니다.
ky는 axios같은 페칭 라이브러리인데, fetch를 확장했고 가벼워서 좋아하는 라이브러리입니다.
axios랑 마찬가지로 fetch의 400, 500 에러를 발생시키지 않는 단점을 해결했고, json 변환도 편하게 할 수 있습니다.

```typescript
import { API_BASE_URL, API_ENDPOINTS } from "@constants/urls";
import type { GetAllProductsResponse } from "@custom-types/products";
import ky from "ky";

type GetAllProductsParams = {
  page?: number;
  limit?: number;
};

export const getAllProducts = async ({ page = 0, limit = 10 }: GetAllProductsParams) => {
  const data = await ky
    .get(`${API_BASE_URL}${API_ENDPOINTS.PRODUCTS}`, {
      searchParams: { skip: page * limit, limit },
    })
    .json<GetAllProductsResponse>();

  return data;
};
```

skip, limit 값을 전달하면 페이지네이션을 사용할 수 있습니다(DummyJSON).
URL은 constants/urls.ts에 상수로 만들어두고 사용하고 있는 상태입니다.

```typescript
export const API_BASE_URL = "https://dummyjson.com/";

export const ROUTES = {
  ROOT: "/",
  PRODUCTS: "/products/",
} as const;

export const API_ENDPOINTS = {
  PRODUCTS: "products",
} as const;
```

# 스켈레톤 구현

로딩 중에 표시할 스켈레톤을 구현해야 합니다.
Base 스켈레톤 컴포넌트를 구현하고, 다른 스켈레톤을 구현할 때 사용해서 구현했습니다.

공통 컴포넌트 Skeleton입니다.
지금 보니까 isAnimate 부분에 삼항연산자를 사용하지 않아도 됐을 것 같네요.

```typescript
import { cn } from "@utils/cn";

type SkeletonProps = {
  className?: string;
  animation?: string;
  isAnimate?: boolean;
};

const Skeleton = ({ animation = "animate-pulse", className, isAnimate = true }: SkeletonProps) => {
  return <div className={cn("rounded-xl bg-gray-200", isAnimate ? animation : "", className)} />;
};

export default Skeleton;
```

실제 ProductCard와 동일한 모양의 스켈레톤입니다.
카드 모양을 통일하기 위해 tailwind v4 @theme을 활용해서 값을 지정해주고 사용하고 있습니다.

```typescript
import Skeleton from "@components/ui/Skeleton";

const ProductCardSkeleton = () => {
  return (
    <li className="h-product-card w-product-card-width rounded-lg border border-gray-200">
      <Skeleton className="h-product-image w-full rounded-t-lg" />
      <div className="space-y-2 px-4 py-4">
        <Skeleton className="h-product-title w-full" />
        <Skeleton className="h-product-price w-20" />
      </div>
    </li>
  );
};

export default ProductCardSkeleton;
```

1. 처음 로딩될 때 표시할 스켈레톤 리스트(ProductListSkeleton)
   - 첫 로딩 시 불러와야 하는 스켈레톤들은 이후 화면에 표시될 스켈레톤들과 동일한 배열을 가지고 있어야 합니다(grid)
2. 무한 스크롤 적용시 불러올 스켈레톤 리스트(ProductCardSkeletonList) - 기존에 불러온 상품 뒤에 이어서 표시되어야 합니다. - 따라서, 배열 관련 코드 없이 스켈레톤만 들어있어야 합니다.
   두 가지가 필요합니다.

특별할건 없습니다. 설명 그대로입니다.

```typescript
import ProductCardSkeletonList from "@components/ui/ProductCardSkeletonList";

type ProductListSkeletonProps = {
  count?: number;
};

const ProductListSkeleton = ({ count = 9 }: ProductListSkeletonProps) => {
  return (
    <div className="flex h-full flex-col items-center">
      <ul className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-3">
        <ProductCardSkeletonList count={count} />
      </ul>
    </div>
  );
};

export default ProductListSkeleton;
```

마찬가지입니다.

```typescript
import ProductCardSkeleton from "@components/ui/ProductCardSkeleton";

const MAX_SKELETON_COUNT = 20;
const SKELETON_INDICES = Array.from({ length: MAX_SKELETON_COUNT }, (_, i) => i);

type ProductCardSkeletonListProps = {
  count?: number;
};

const ProductCardSkeletonList = ({ count = 6 }: ProductCardSkeletonListProps) => {
  return (
    <>
      {SKELETON_INDICES.slice(0, count).map((index) => (
        <ProductCardSkeleton key={`skeleton-${index}`} />
      ))}
    </>
  );
};

export default ProductCardSkeletonList;
```

# 무한 스크롤 구현하기

## tanstack query의 useSuspenseInfiniteQuery

tanstack query에 좀 더 익숙해지고 싶어서, 직접 useFetch 훅을 구현하지 않고 useSuspensiveInfiniteQuery를 사용했습니다.
useSuspensiveInfiniteQuery를 사용해야 Suspense를 지원합니다. Suspensive 라이브러리를 써보고 싶어서 사용했습니다.

```typescript
const {
  fetchNextPage,
  fetchPreviousPage,
  hasNextPage,
  hasPreviousPage,
  isFetchingNextPage,
  isFetchingPreviousPage,
  promise,
  ...result
} = useInfiniteQuery({
  queryKey,
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 1,
  ...options,
  getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => lastPage.nextCursor,
  getPreviousPageParam: (firstPage, allPages, firstPageParam, allPageParams) =>
    firstPage.prevCursor,
});
```

useInfiniteQuery의 기본 구조입니다. useInfiniteQuery는 useSuspensiveInfiniteQuery와 Suspensive의 지원 유무의 차이 외에 동일합니다.

- fetchNextPage: 다음 페이지를 요청할 때 사용하는 함수
- hasNextPage: 다음 페이지가 있는지 확인하는 boolean
- isFetchingNextPage: 다음 페이지를 불러오는 중인지 확인하는 boolean
- initialPageParam: 첫 번째 페이지를 요청할 때 queryFn으로 전달되는 pageParam의 초기값을 지정합니다(시작 위치를 지정)
- getNextPageParam: 새로운 페이지의 데이터를 성공적으로 받아온 후, 다음 페이지를 요청할때 사용할 pageParam 값을 계산하는 함수입니다.

그대로 쓰지는 않았고, 훅을 만들어서 분리했습니다.

```typescript
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";

type UseInfiniteScrollParams<QueryFnData, QueryKey extends readonly unknown[]> = {
  queryKey: QueryKey;
  queryFn: ({ pageParam }: { pageParam: number }) => Promise<QueryFnData>;
  initialPage?: number;
  getNextPageParam: (lastPage: QueryFnData, allPages: QueryFnData[]) => number | undefined;
};

function useInfiniteScroll<QueryFnData, QueryKey extends readonly unknown[]>({
  queryKey,
  queryFn,
  initialPage = 0,
  getNextPageParam,
}: UseInfiniteScrollParams<QueryFnData, QueryKey>) {
  return useSuspenseInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 0 }) => queryFn({ pageParam }),
    getNextPageParam,
    initialPageParam: initialPage,
  });
}

export default useInfiniteScroll;
```

```javascript
// 사용하지 않을 경우
const { data, fetchNextPage, ... } = useSuspenseInfiniteQuery({
    queryKey: ['keyA'],
    queryFn: ({ pageParam = 0 }) => fetchMyDataA({ pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => { /* ... */ }
});
```

```javascript
// 사용할 경우
const { data, fetchNextPage, ... } = useInfiniteScroll({
    queryKey: ['keyA'],
    queryFn: fetchMyDataA,
    getNextPageParam: (lastPage) => { /* ... */ }
});
```

tanstack query를 사용하지 않고 직접 구현했을 때, 훅으로 분리했을 때의 장점이 많이 드러났던 경험이 있습니다.

지금은 모양이 크게 차이나지 않기 때문에 훅을 사용해서 분리했을때의 장점 중 하나인 코드가 간소화된다는 장점은 잘 느껴지지 않아서, 훅을 지울까 말까 고민을 했었습니다.

프로젝트를 진행하면서 무한 스크롤이 필요할 경우, 일관된 컨벤션을 강제할 수 있는 장점 때문에 그대로 유지하고 진행했습니다.

# useIntersect 훅과 InfiniteScrollTrigger 만들기

## useIntersect 훅 구현

스켈레톤을 로딩해야하는지 감지하기 위해서 IntersectionObserver를 사용해야 합니다. (스크롤을 감지해서 구현할 수도 있지만 여기서는 IntersectionObserver를 사용했습니다)

```typescript
import { useEffect, useRef } from "react";

type UseIntersectOptions = {
  threshold?: number;
  rootMargin?: string;
};

type UseIntersectReturn<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
};

const useIntersect = <T extends HTMLElement>(
  callback: (isIntersecting: boolean) => void,
  options: UseIntersectOptions = {}
): UseIntersectReturn<T> => {
  const ref = useRef<T | null>(null);
  const isIntersectingRef = useRef(false);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isIntersecting = entry.isIntersecting;

        if (isIntersecting !== isIntersectingRef.current) {
          isIntersectingRef.current = isIntersecting;
          callbackRef.current(isIntersecting);
        }
      },
      {
        threshold: options.threshold ?? 0.1,
        rootMargin: options.rootMargin,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options.threshold, options.rootMargin]);

  return { ref };
};

export default useIntersect;
```

## InfiniteScrollTrigger 구현

타깃이 화면에 들어오는걸 감지하기 때문에, Trigger역할을 할 컴포넌트도 만들어줘야 하는데, 이것도 마찬가지로 컨벤션을 강제하고 싶어서 따로 분리했습니다.

```typescript
import { useIntersect } from "@hooks";
import { useCallback } from "react";

type InfiniteScrollTriggerProps = {
  hasNextPage: boolean;
  fetchNextPage: () => void;
};

const InfiniteScrollTrigger = ({ hasNextPage, fetchNextPage }: InfiniteScrollTriggerProps) => {
  const handleIntersect = useCallback(
    (isIntersecting: boolean) => {
      if (isIntersecting && hasNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, fetchNextPage]
  );

  const { ref } = useIntersect<HTMLDivElement>(handleIntersect);

  return <div ref={ref} className="h-1" />;
};

export default InfiniteScrollTrigger;
```

# 사용하는 페이지 코드

```typescript
import { getAllProducts } from "@api/getAllProducts";
import {
  ErrorFallback,
  InfiniteScrollTrigger,
  ProductCard,
  ProductCardSkeletonList,
  ProductListSkeleton,
} from "@components/ui";
import { queryKeys } from "@constants/queryKeys";
import { ROUTES } from "@constants/urls";
import { useInfiniteScroll } from "@hooks";
import { ErrorBoundary, Suspense } from "@suspensive/react";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(ROUTES.PRODUCTS)({
  component: ProductsListRoute,
});

function ProductsListRoute() {
  return (
    <Suspense fallback={<ProductListSkeleton />}>
      <ErrorBoundary fallback={({ error }) => <ErrorFallback error={error} />}>
        <ProductsListPage />
      </ErrorBoundary>
    </Suspense>
  );
}

function ProductsListPage() {
  const PRODUCTS_PER_PAGE = 10;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteScroll({
    queryKey: queryKeys.products.infinite,
    queryFn: ({ pageParam }) => getAllProducts({ page: pageParam, limit: PRODUCTS_PER_PAGE }),
    initialPage: 0,
    getNextPageParam: (lastPage, allPages) => {
      const hasMore = allPages.length * PRODUCTS_PER_PAGE < lastPage.total;
      return hasMore ? allPages.length : undefined;
    },
  });

  const products = data.pages.flatMap((page) => page.products);

  return (
    <main aria-label="전체 상품" className="flex h-full flex-col items-center">
      <h1 className="sr-only">전체 상품 목록</h1>
      <ul className="grid grid-cols-2 gap-4 px-4 sm:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard {...product} />
          </li>
        ))}

        {isFetchingNextPage && <ProductCardSkeletonList count={PRODUCTS_PER_PAGE} />}
      </ul>

      <InfiniteScrollTrigger hasNextPage={hasNextPage} fetchNextPage={fetchNextPage} />
    </main>
  );
}
```

관련된 코드는 이 글에 거의 다 포함되어 있지만, 혹시나 궁금하신 분들은 아래 PR에서 전체 코드를 보실 수 있습니다.
https://github.com/quartzs2/dorothy/pull/8

읽어주셔서 감사합니다.
