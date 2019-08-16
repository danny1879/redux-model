import { BaseReducer } from '../reducer/BaseReducer';
import { ForgetRegisterError } from '../exceptions/ForgetRegisterError';
import {
  ActionResponse,
  BaseActionRequest,
  Effects,
  Meta,
  Metas,
  PayloadData,
  PayloadKey,
  Reducers,
  RequestActionParamNoMeta,
  RequestSubscriber,
  UseSelector,
} from '../utils/types';
import { ActionRequest, FetchHandle } from '../../libs/types';
import { getStore } from '../utils/createReduxStore';
import { BaseAction } from './BaseAction';

const DEFAULT_META: Meta = {
  actionType: '',
  loading: false,
};

export abstract class BaseRequestAction<Data, A extends (...args: any[]) => FetchHandle<Response, Payload>, Response, Payload> extends BaseAction<Data> {
  public readonly action: A;

  protected readonly meta: boolean | PayloadKey<A>;

  protected readonly prepareCallback?: any;

  protected readonly successCallback?: any;

  protected readonly failCallback?: any;

  protected prepareType: string;

  protected failType: string;

  protected metaInstance: BaseReducer<Meta> | null = null;

  protected metasInstance: BaseReducer<Metas> | null = null;

  public constructor(config: RequestActionParamNoMeta<Data, A, Response, Payload>, instanceName: string) {
    super(instanceName);
    // @ts-ignore
    this.action = (...args: any[]) => {
      const data = config.action(...args) as unknown as ActionRequest;

      data.type = {
        prepare: this.prepareType,
        success: this.successType,
        fail: this.failType,
      };

      return getStore().dispatch(data);
    };

    this.meta = config.meta === undefined ? true : config.meta;
    this.prepareCallback = config.onPrepare;
    this.successCallback = config.onSuccess;
    this.failCallback = config.onFail;
    this.prepareType = `${this.typePrefix} prepare`;
    this.failType = `${this.typePrefix} fail`;
  }

  public static createRequestData(options: Partial<BaseActionRequest> & Pick<BaseActionRequest, 'uri' | 'method' | 'middleware'>) {
    const data: Omit<BaseActionRequest, 'type'> = {
      middleware: options.middleware,
      payload: options.payload === undefined ? {} : options.payload,
      uri: options.uri,
      method: options.method,
      body: options.body || {},
      query: options.query || {},
      successText: options.successText || '',
      hideError: options.hideError || false,
      requestOptions: options.requestOptions || {},
    };

    return data;
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
      when: this.prepareType,
      effect,
    };
  }

  public collectEffects(): Effects<Data> {
    const effects = super.collectEffects();

    if (this.prepareCallback) {
      effects.push({
        when: this.prepareType,
        effect: this.prepareCallback,
      });
    }

    if (this.successCallback) {
      effects.push({
        when: this.successType,
        effect: this.successCallback,
      });
    }

    if (this.failCallback) {
      effects.push({
        when: this.failType,
        effect: this.failCallback,
      });
    }

    return effects;
  }

  public collectReducers(): Reducers {
    let obj = super.collectReducers();

    if (this.meta !== false) {
      if (this.meta === true) {
        obj = { ...obj, ...this.createMeta().createData(false) };
      } else {
        obj = { ...obj, ...this.createMetas(this.meta).createData(false) };
      }
    }

    return obj;
  }

  public getPrepareType(): string {
    return this.prepareType;
  }

  public getFailType(): string {
    return this.failType;
  }

  public useMeta<T = Meta>(filter?: (meta: Meta) => T): T {
    if (!this.metaInstance) {
      throw new ForgetRegisterError(this.instanceName);
    }

    const reducerName = this.metaInstance.getReducerName();

    return this.switchReduxSelector()((state: any) => {
      const customMeta = state[reducerName];

      if (customMeta === undefined) {
        throw new ForgetRegisterError(this.instanceName);
      }

      return filter ? filter(customMeta) : customMeta;
    });
  }

  public useMetas<T = Meta>(payloadData?: PayloadData, filter?: (meta: Meta) => T): Metas | T {
    if (!this.metasInstance) {
      throw new ForgetRegisterError(this.instanceName);
    }

    if (payloadData === undefined) {
      filter = undefined;
    }

    return this.switchReduxSelector()((state: any) => {
      const reducerName = this.metasInstance!.getReducerName();
      const customMetas = state[reducerName];

      if (customMetas === undefined) {
        throw new ForgetRegisterError(this.instanceName);
      }

      const customMeta = payloadData === undefined ? customMetas : customMetas[payloadData] || DEFAULT_META;

      return filter ? filter(customMeta) : customMeta;
    });
  }

  public useLoading(payloadData?: PayloadData): boolean {
    return payloadData === undefined
      ? this.useMeta((meta) => meta.loading)
      : this.useMetas(payloadData, (meta) => meta.loading) as boolean;
  }

  public connectMeta(): Meta {
    if (!this.metaInstance) {
      throw new ForgetRegisterError(this.instanceName);
    }

    return this.metaInstance.getCurrentReducerData();
  }

  public connectMetas(payloadData?: PayloadData): Metas | Meta {
    if (!this.metasInstance) {
      throw new ForgetRegisterError(this.instanceName);
    }

    const reducer = this.metasInstance.getCurrentReducerData();

    return payloadData === undefined
      ? reducer
      : reducer[payloadData] || DEFAULT_META;
  }

  public connectLoading(payloadData?: PayloadData): boolean {
    return payloadData === undefined
      ? this.connectMeta().loading
      : (this.connectMetas(payloadData) as Meta).loading;
  }

  protected onTypePrefixChanged(): void {
    super.onTypePrefixChanged();
    this.prepareType = `${this.typePrefix} prepare`;
    this.failType = `${this.typePrefix} fail`;
  }

  protected createMeta(): BaseReducer<Meta> {
    this.metaInstance = new BaseReducer<Meta>(DEFAULT_META, this.typePrefix, 'meta');
    this.metaInstance.addCase(
      {
        when: this.prepareType,
        effect: () => {
          return {
            actionType: this.prepareType,
            loading: true,
          };
        }
      },
      {
        when: this.successType,
        effect: () => {
          return {
            actionType: this.successType,
            loading: false,
          };
        },
      },
      {
        when: this.failType,
        effect: (_, action: ActionResponse) => {
          return {
            actionType: this.failType,
            loading: false,
            errorMessage: action.errorMessage,
            httpStatus: action.httpStatus,
            businessCode: action.businessCode,
          };
        },
      },
    );

    return this.metaInstance;
  }

  protected createMetas(payloadKey: any): BaseReducer<Metas> {
    this.metasInstance = new BaseReducer<Metas>({}, this.typePrefix, 'metas');
    this.metasInstance.addCase(
      {
        when: this.prepareType,
        effect: (state, action: ActionResponse) => {
          return {
            ...state,
            [action.payload[payloadKey]]: {
              actionType: action.type,
              loading: true,
            },
          };
        },
      },
      {
        when: this.successType,
        effect: (state, action: ActionResponse) => {
          return {
            ...state,
            [action.payload[payloadKey]]: {
              actionType: action.type,
              loading: false,
            },
          };
        },
      },
      {
        when: this.failType,
        effect: (state, action: ActionResponse) => {
          return {
            ...state,
            [action.payload[payloadKey]]: {
              actionType: action.type,
              loading: false,
              errorMessage: action.errorMessage,
              httpStatus: action.httpStatus,
              businessCode: action.businessCode,
            },
          };
        },
      },
    );

    return this.metasInstance;
  }

  protected abstract switchReduxSelector<TState = any, TSelected = any>(): UseSelector<TState, TSelected>;
}
