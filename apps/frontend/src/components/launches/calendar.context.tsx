'use client';
import 'reflect-metadata';

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import dayjs from 'dayjs';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Post, Integration } from '@prisma/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { isGeneral } from '@gitroom/react/helpers/is.general';

const CalendarContext = createContext({
  currentWeek: dayjs().week(),
  currentYear: dayjs().year(),
  comments: [] as Array<{ date: string; total: number }>,
  integrations: [] as Integrations[],
  trendings: [] as string[],
  posts: [] as Array<Post & { integration: Integration }>,
  setFilters: (filters: { currentWeek: number; currentYear: number }) => {},
  changeDate: (id: string, date: dayjs.Dayjs) => {},
});

export interface Integrations {
  name: string;
  id: string;
  disabled?: boolean;
  inBetweenSteps: boolean;
  identifier: string;
  type: string;
  picture: string;
}

function getWeekNumber(date: Date) {
    // Copy date so don't modify original
    const targetDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    targetDate.setUTCDate(targetDate.getUTCDate() + 4 - (targetDate.getUTCDay() || 7));
    // Get first day of year
    const yearStart = new Date(Date.UTC(targetDate.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    return Math.ceil((((targetDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function isISOWeek(date: Date, weekNumber: number): boolean {
    // Copy date so don't modify original
    const targetDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    targetDate.setUTCDate(targetDate.getUTCDate() + 4 - (targetDate.getUTCDay() || 7));
    // Get first day of year
    const yearStart = new Date(Date.UTC(targetDate.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const isoWeekNo = Math.ceil((((targetDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return isoWeekNo === weekNumber;
}

export const CalendarWeekProvider: FC<{
  children: ReactNode;
  integrations: Integrations[];
}> = ({ children, integrations }) => {
  const fetch = useFetch();
  const [internalData, setInternalData] = useState([] as any[]);
  const [trendings, setTrendings] = useState<string[]>([]);
  const { mutate } = useSWRConfig();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      if (isGeneral()) {
        return [];
      }
      setTrendings(await (await fetch('/posts/predict-trending')).json());
    })();
  }, []);

  const [filters, setFilters] = useState({
    currentWeek: +(searchParams.get('week') || getWeekNumber(new Date())),
    currentYear: +(searchParams.get('year') || dayjs().year()),
  });

  const isIsoWeek = useMemo(() => {
    return isISOWeek(new Date(), filters.currentWeek);
  }, [filters]);

  const setFiltersWrapper = useCallback(
    (filters: { currentWeek: number; currentYear: number }) => {
      setFilters(filters);
      router.replace(
        `/launches?week=${filters.currentWeek}&year=${filters.currentYear}`
      );
      setTimeout(() => {
        mutate('/posts');
      });
    },
    [filters]
  );

  const params = useMemo(() => {
    return new URLSearchParams({
      week: filters.currentWeek.toString(),
      year: filters.currentYear.toString()
    }).toString();
  }, [filters]);

  const loadData = useCallback(
    async (url: string) => {
      const data = (await fetch(`${url}?${params}`)).json();
      return data;
    },
    [filters]
  );

  const swr = useSWR(`/posts`, loadData, {
    refreshInterval: 3600000,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
  });
  const { isLoading } = swr;
  const { posts, comments } = swr?.data || { posts: [], comments: [] };

  const changeDate = useCallback(
    (id: string, date: dayjs.Dayjs) => {
      setInternalData((d) =>
        d.map((post: Post) => {
          if (post.id === id) {
            return {
              ...post,
              publishDate: date.utc().format('YYYY-MM-DDTHH:mm:ss'),
            };
          }
          return post;
        })
      );
    },
    [posts, internalData]
  );

  useEffect(() => {
    if (posts) {
      setInternalData(posts);
    }
  }, [posts]);

  return (
    <CalendarContext.Provider
      value={{
        trendings,
        ...filters,
        posts: isLoading ? [] : internalData,
        integrations,
        setFilters: setFiltersWrapper,
        changeDate,
        comments,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
};

export const useCalendar = () => useContext(CalendarContext);
