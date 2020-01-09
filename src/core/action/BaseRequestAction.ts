import assign from 'object-assign';
import {
  Meta,
  MetasLoading,
  Metas,
  RequestSubscriber,
  UseSelector,
} from '../utils/types';
import { BaseAction } from './BaseAction';
import MetaReducer from '../reducer/MetaReducer';
import { HttpServiceBuilder } from '../service/HttpServiceBuilder';
import { DEFAULT_META, DEFAULT_METAS, METAS_PICK_METHOD } from '../utils/meta';
import { ActionRequest, FetchHandle } from '../../libs/types';
import { useProxy } from '../utils/dev';

export abstract class BaseRequestAction<Data, A extends (...args: any[]) => HttpServiceBuilder<Data, Response, Payload, M>, Response, Payload, M> extends BaseAction {
  protected prepareType: string;

  protected failType: string;

  // Avoid re-render component even if reducer data doesn't change.
  protected loadingsCache?: [Metas, MetasLoading<M>];

  protected readonly clearThrottleFunc: (key: string) => void;

  public constructor(config: {
    request: A
    instanceName: string;
    runAction: (action: ActionRequest) => FetchHandle<Response, Payload>;
    clearThrottle: (key: string) => void;
  }) {
    super(config.instanceName);

    this.clearThrottleFunc = config.clearThrottle;
    this.prepareType = `${this.typePrefix} prepare`;
    this.failType = `${this.typePrefix} fail`;

    if (!useProxy()) {
      this.registerMetas();
    }

    // @ts-ignore
    return this.proxy((...args: Parameters<A>) => {
      const action = (config.request(...args) as unknown as HttpServiceBuilder<Data, Response, Payload, M>)
        .collect({
          prepare: this.prepareType,
          success: this.successType,
          fail: this.failType,
        });

      return config.runAction(action);
    }, [
      'onSuccess', 'onPrepare', 'onFail',
      'getPrepareType', 'getFailType',
      'useMeta', 'useMetas', 'useLoading', 'useLoadings',
      'clearThrottle',
    ], [
      'meta', 'metas', 'loading', 'loadings',
    ]);
  }

  public clearThrottle(): void {
    this.clearThrottleFunc(this.successType);
  }

  public onSuccess<CustomData>(effect: RequestSubscriber<CustomData, Response, Payload>['effect']): RequestSubscriber<CustomData, Response, Payload> {
    return {
      when: this.successType,
      effect,
    };
  }

  public onPrepare<CustomData>(effect: RequestSubscriber<CustomData, Response, Payload>['effect']): RequestSubscriber<CustomData, Response, Payload> {
    return {
      when: this.prepareType,
      effect,
    };
  }

  public onFail<CustomData>(effect: RequestSubscriber<CustomData, Response, Payload>['effect']): RequestSubscriber<CustomData, Response, Payload> {
    return {
      when: this.failType,
      effect,
    };
  }

  public getPrepareType(): string {
    return this.prepareType;
  }

  public getFailType(): string {
    return this.failType;
  }

  public useMeta<T extends keyof Meta>(key?: T): Meta | Meta[T] {
    MetaReducer.record(this.typePrefix);

    return this.switchReduxSelector()((state: any) => {
      let customMeta: Meta | undefined = state[MetaReducer.reducerName][this.typePrefix];

      if (customMeta === undefined) {
        customMeta = DEFAULT_META;
      }

      return key ? customMeta[key] : customMeta;
    });
  }

  public useMetas<T extends keyof Meta>(value?: M, metaKey?: T): Metas<M> | Meta | Meta[T] {
    MetaReducer.record(this.typePrefix);

    return this.switchReduxSelector()((state: any) => {
      let customMetas: Metas<M> = state[MetaReducer.reducerName][this.typePrefix] || DEFAULT_METAS;

      // Parameter `metaKey` is useless here.
      if (value === undefined) {
        if (!customMetas.pick) {
          assign(customMetas, METAS_PICK_METHOD);
        }

        return customMetas;
      }

      // @ts-ignore
      const customMeta: Meta = customMetas[value] || DEFAULT_META;

      return metaKey ? customMeta[metaKey] : customMeta;
    });
  }

  public useLoading(): boolean {
    return this.useMeta('loading') as boolean;
  }

  public useLoadings(value?: M): boolean | MetasLoading<M> {
    return value === undefined
      ? this.getLoadingHandle(<Metas>this.useMetas())
      : this.useMetas(value, 'loading') as boolean;
  }

  public get meta(): Meta {
    MetaReducer.record(this.typePrefix);

    return MetaReducer.getData<Meta>(this.typePrefix) || DEFAULT_META;
  }

  public get metas(): Metas<M> {
    MetaReducer.record(this.typePrefix);
    const metas: Metas<M> = MetaReducer.getData<Metas>(this.typePrefix) || DEFAULT_METAS;

    if (!metas.pick) {
      assign(metas, METAS_PICK_METHOD);
    }

    return metas;
  }

  public get loading(): boolean {
    return this.meta.loading;
  }

  public get loadings(): MetasLoading<M> {
    return this.getLoadingHandle(this.metas);
  }

  protected getLoadingHandle(metas: Metas): MetasLoading<M> {
    if (!this.loadingsCache || this.loadingsCache[0] !== metas) {
      this.loadingsCache = [metas, {
        pick: (payload) => {
          return metas.pick(payload).loading;
        },
      }];
    }

    return this.loadingsCache[1];
  }

  protected onTypePrefixChanged(): void {
    super.onTypePrefixChanged();
    this.prepareType = `${this.typePrefix} prepare`;
    this.failType = `${this.typePrefix} fail`;

    if (useProxy()) {
      this.registerMetas();
    }
  }

  protected registerMetas() {
    const types = {
      prepare: this.prepareType,
      success: this.successType,
      fail: this.failType,
    };

    MetaReducer.addCase(this.typePrefix, types);
  }

  protected abstract switchReduxSelector<TState = any, TSelected = any>(): UseSelector<TState, TSelected>;
}
