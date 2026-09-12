// Literal projections from the immutable React DB 0.3.8 declarations.
export interface ExpectedCoreContracts {
	Collection:
		| typeof Symbol.iterator
		| 'utils'
		| 'singleResult'
		| 'id'
		| 'config'
		| '_lifecycle'
		| '_sync'
		| '_state'
		| 'deferDataRefresh'
		| 'status'
		| 'subscriberCount'
		| '_stateRevision'
		| '_layoutRevision'
		| '_subscribeLayoutChanges'
		| '_markLayoutChange'
		| '_deferPublication'
		| 'onFirstReady'
		| 'isReady'
		| 'isLoadingSubset'
		| 'startSyncImmediate'
		| '_setTransactionScope'
		| '_hasHydratedKey'
		| '_deferSyncStart'
		| '_resumeSyncStart'
		| 'preload'
		| 'get'
		| 'has'
		| 'size'
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| 'getKeyFromItem'
		| 'createIndex'
		| 'removeIndex'
		| 'getIndexMetadata'
		| 'indexes'
		| 'validateData'
		| 'compareOptions'
		| 'insert'
		| 'update'
		| 'delete'
		| 'state'
		| 'stateWhenReady'
		| 'toArray'
		| 'toArrayWhenReady'
		| 'currentStateAsChanges'
		| 'subscribeChanges'
		| 'on'
		| 'once'
		| 'off'
		| 'waitFor'
		| 'cleanup';
	createTransaction: 1;
	withCollectionConfigFactory: 2;
	deepEquals: 2;
	VirtualRowProps: '$synced' | '$origin' | '$key' | '$collectionId';
	VirtualOrigin: 'local' | 'remote';
	WithVirtualProps: 'id' | '$synced' | '$origin' | '$key' | '$collectionId' | 'name';
	WithoutVirtualProps: 'id' | 'name';
	hasVirtualProps: 1;
	BaseIndex:
		| 'id'
		| 'update'
		| 'name'
		| 'expression'
		| 'supportedOperations'
		| 'add'
		| 'remove'
		| 'build'
		| 'clear'
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'takeReversed'
		| 'takeReversedFromEnd'
		| 'keyCount'
		| 'equalityLookup'
		| 'inArrayLookup'
		| 'rangeQuery'
		| 'rangeQueryReversed'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor'
		| 'matchesField'
		| 'matchesCompareOptions'
		| 'matchesDirection';
	IndexInterface:
		| 'update'
		| 'add'
		| 'remove'
		| 'build'
		| 'clear'
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'takeReversed'
		| 'takeReversedFromEnd'
		| 'keyCount'
		| 'equalityLookup'
		| 'inArrayLookup'
		| 'rangeQuery'
		| 'rangeQueryReversed'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor'
		| 'matchesField'
		| 'matchesCompareOptions'
		| 'matchesDirection';
	IndexConstructor: 2 | 3 | 4;
	IndexOperation:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| '0'
		| 'toString'
		| 'toLocaleString'
		| 'concat'
		| 'join'
		| 'slice'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with'
		| '1'
		| '2'
		| '3'
		| '4'
		| '5'
		| '6'
		| '7';
	IndexReader:
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'keyCount'
		| 'rangeQuery'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor';
	IndexOptions: 'name' | 'indexType' | 'options';
	BasicIndex:
		| 'id'
		| 'update'
		| 'name'
		| 'expression'
		| 'supportedOperations'
		| 'add'
		| 'remove'
		| 'build'
		| 'clear'
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'takeReversed'
		| 'takeReversedFromEnd'
		| 'keyCount'
		| 'equalityLookup'
		| 'inArrayLookup'
		| 'rangeQuery'
		| 'rangeQueryReversed'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor'
		| 'matchesField'
		| 'matchesCompareOptions'
		| 'matchesDirection';
	BasicIndexOptions: 'compareOptions' | 'compareFn';
	RangeQueryOptions: 'from' | 'to' | 'fromInclusive' | 'toInclusive';
	BTreeIndex:
		| 'id'
		| 'update'
		| 'name'
		| 'expression'
		| 'supportedOperations'
		| 'add'
		| 'remove'
		| 'build'
		| 'clear'
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'takeReversed'
		| 'takeReversedFromEnd'
		| 'keyCount'
		| 'equalityLookup'
		| 'inArrayLookup'
		| 'rangeQuery'
		| 'rangeQueryReversed'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor'
		| 'matchesField'
		| 'matchesCompareOptions'
		| 'matchesDirection';
	BTreeRangeQueryOptions: 'from' | 'to' | 'fromInclusive' | 'toInclusive';
	ReverseIndex:
		| 'lookup'
		| 'take'
		| 'takeFromStart'
		| 'keyCount'
		| 'rangeQuery'
		| 'supports'
		| 'supportsRangeOptimization'
		| 'canOptimizeRangeFor';
	optimizeExpressionWithIndexes: 2;
	findIndexForField: 2 | 3;
	configureIndexDevMode: 1;
	isDevModeEnabled: 0;
	getIndexDevModeConfig: 0;
	trackQuery: 3;
	clearQueryPatterns: 0;
	getQueryPatterns: 0;
	IndexDevModeConfig:
		'enabled' | 'collectionSizeThreshold' | 'slowQueryThresholdMs' | 'onSuggestion';
	IndexSuggestion:
		| 'type'
		| 'collectionId'
		| 'fieldPath'
		| 'message'
		| 'collectionSize'
		| 'queryTimeMs'
		| 'queryCount';
	createEffect: 1;
	DeltaEvent: 'metadata' | 'value' | 'type' | 'key';
	DeltaType: 'update' | 'enter' | 'exit';
	EffectConfig:
		| 'id'
		| 'query'
		| 'onEnter'
		| 'onUpdate'
		| 'onExit'
		| 'onBatch'
		| 'onError'
		| 'onSourceError'
		| 'skipInitial';
	EffectContext: 'effectId' | 'signal';
	Effect: 'dispose' | 'disposed';
	EffectQueryInput: never;
	safeRandomUUID: 0;
	IR:
		| 'isExpressionLike'
		| 'collectCollectionSources'
		| 'getWhereExpression'
		| 'getHavingExpression'
		| 'isResidualWhere'
		| 'createResidualWhere'
		| 'getFromSources'
		| 'followRef'
		| 'INCLUDES_SCALAR_FIELD'
		| 'CollectionRef'
		| 'QueryRef'
		| 'UnionFrom'
		| 'UnionAll'
		| 'PropRef'
		| 'Value'
		| 'Func'
		| 'Aggregate'
		| 'IncludesSubquery'
		| 'ConditionalSelect';
	operators:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| '0'
		| 'toString'
		| 'toLocaleString'
		| 'concat'
		| 'join'
		| 'slice'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with'
		| '1'
		| '2'
		| '3'
		| '4'
		| '5'
		| '6'
		| '7'
		| '8'
		| '9'
		| '10'
		| '11'
		| '12'
		| '13'
		| '14'
		| '15'
		| '16'
		| '17'
		| '18'
		| '19'
		| '20'
		| '21'
		| '22'
		| '23'
		| '24'
		| '25'
		| '26'
		| '27';
	OperatorName:
		| 'length'
		| 'concat'
		| 'eq'
		| 'gt'
		| 'gte'
		| 'lt'
		| 'lte'
		| 'in'
		| 'like'
		| 'ilike'
		| 'add'
		| 'and'
		| 'or'
		| 'not'
		| 'isNull'
		| 'isUndefined'
		| 'upper'
		| 'lower'
		| 'subtract'
		| 'multiply'
		| 'divide'
		| 'coalesce'
		| 'caseWhen'
		| 'count'
		| 'avg'
		| 'sum'
		| 'min'
		| 'max';
	createCollection: 1;
	CollectionIndexMetadata:
		'name' | 'expression' | 'options' | 'signatureVersion' | 'signature' | 'indexId' | 'resolver';
	CollectionImpl:
		| typeof Symbol.iterator
		| 'utils'
		| 'id'
		| 'config'
		| '_lifecycle'
		| '_sync'
		| '_state'
		| 'deferDataRefresh'
		| 'status'
		| 'subscriberCount'
		| '_stateRevision'
		| '_layoutRevision'
		| '_subscribeLayoutChanges'
		| '_markLayoutChange'
		| '_deferPublication'
		| 'onFirstReady'
		| 'isReady'
		| 'isLoadingSubset'
		| 'startSyncImmediate'
		| '_setTransactionScope'
		| '_hasHydratedKey'
		| '_deferSyncStart'
		| '_resumeSyncStart'
		| 'preload'
		| 'get'
		| 'has'
		| 'size'
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| 'getKeyFromItem'
		| 'createIndex'
		| 'removeIndex'
		| 'getIndexMetadata'
		| 'indexes'
		| 'validateData'
		| 'compareOptions'
		| 'insert'
		| 'update'
		| 'delete'
		| 'state'
		| 'stateWhenReady'
		| 'toArray'
		| 'toArrayWhenReady'
		| 'currentStateAsChanges'
		| 'subscribeChanges'
		| 'on'
		| 'once'
		| 'off'
		| 'waitFor'
		| 'cleanup';
	SortedMap:
		| typeof Symbol.iterator
		| 'get'
		| 'has'
		| 'size'
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'delete'
		| 'clear'
		| 'set';
	getActiveTransaction: 0;
	TransactionScope:
		| 'clear'
		| 'createTransaction'
		| 'getActiveTransaction'
		| 'getActiveTransactionForCollection'
		| 'registerTransaction'
		| 'unregisterTransaction'
		| 'removeTransaction'
		| 'rollbackConflictingTransactions';
	Transaction:
		| 'id'
		| 'state'
		| 'mutations'
		| 'mutationFn'
		| 'isPersisted'
		| 'autoCommit'
		| 'createdAt'
		| 'sequenceNumber'
		| 'metadata'
		| 'error'
		| 'setState'
		| 'mutate'
		| 'applyMutations'
		| 'rollback'
		| 'touchCollection'
		| 'commit'
		| 'compareCreatedAt';
	collectionOptions: 2;
	isCollectionOptions: 1;
	CollectionOptions:
		| 'id'
		| typeof import('../node_modules/@tanstack/db/dist/esm/collection-options').collectionOptionsBrand
		| typeof import('../node_modules/@tanstack/db/dist/esm/collection-options').collectionOptionsFactory;
	CollectionMaterializeOptions: 'initialData';
	DehydratedCollectionRow: 'metadata' | 'value' | 'key';
	DehydratedCollectionChunk: 'collectionId' | 'rows' | 'syncMeta';
	DehydratedLiveQuery: 'queryHash' | 'dehydratedAt' | 'snapshot' | 'promise';
	DehydratedLiveQueryResult: 'rows';
	DehydratedDbState: 'collections' | 'liveQueries';
	DbClientLiveQueryState: 'error' | 'pending' | 'success';
	DbClientLiveQuery: 'status' | 'error' | 'queryHash' | 'dehydratedAt' | 'snapshot' | 'promise';
	DbClientEvent: 'type';
	DehydrateDbClientOptions: 'shouldDehydrateCollection' | 'shouldDehydrateLiveQuery';
	DbClientOptions: string;
	DbClient:
		| 'cleanup'
		| 'createTransaction'
		| 'getDependency'
		| 'requireDependency'
		| 'activeTransaction'
		| 'preloadLiveQuery'
		| 'collection'
		| '_materializeCollectionForRender'
		| 'dehydrate'
		| 'hydrate'
		| 'applyCollectionChunk'
		| 'subscribe'
		| '_setSsrStreamingEnabled'
		| '_isSsrStreamingEnabled'
		| '_setSsrServerCleanupEnabled'
		| '_isSsrServerCleanupEnabled'
		| '_getLiveQuery'
		| '_consumeLiveQueryResult'
		| '_registerLiveQuery'
		| '_registerLiveQueryResource'
		| '_failPendingLiveQueries';
	CollectionLike: 'id' | 'get' | 'has' | 'entries' | 'indexes' | 'compareOptions';
	StringCollationConfig: 'stringSort';
	InferSchemaOutput: 'id' | 'name';
	InferSchemaInput: 'id' | 'name';
	TransactionState: 'pending' | 'persisting' | 'completed' | 'failed';
	Fn: number;
	UtilsRecord: string;
	ResolveTransactionChanges: string;
	PendingMutation:
		| 'createdAt'
		| 'metadata'
		| 'type'
		| 'key'
		| 'collection'
		| 'mutationId'
		| 'original'
		| 'modified'
		| 'changes'
		| 'globalKey'
		| 'syncMetadata'
		| 'optimistic'
		| 'updatedAt';
	MutationFnParams: 'transaction';
	MutationFn: 1;
	NonEmptyArray:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| '0'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with';
	TransactionWithMutations:
		| 'id'
		| 'state'
		| 'mutations'
		| 'mutationFn'
		| 'isPersisted'
		| 'autoCommit'
		| 'createdAt'
		| 'sequenceNumber'
		| 'metadata'
		| 'error'
		| 'setState'
		| 'mutate'
		| 'applyMutations'
		| 'rollback'
		| 'touchCollection'
		| 'commit'
		| 'compareCreatedAt';
	TransactionConfig: 'id' | 'mutationFn' | 'autoCommit' | 'metadata';
	CreateOptimisticActionsOptions: 'id' | 'mutationFn' | 'autoCommit' | 'metadata' | 'onMutate';
	Row: string;
	OperationType: 'insert' | 'update' | 'delete';
	SubscriptionStatus: 'ready' | 'loadingSubset';
	SubscriptionStatusChangeEvent: 'status' | 'type' | 'subscription' | 'previousStatus';
	SubscriptionStatusEvent: 'status' | 'type' | 'subscription' | 'previousStatus';
	SubscriptionLoadSubsetErrorEvent: 'error' | 'type' | 'options' | 'subscription';
	SubscriptionUnsubscribedEvent: 'type' | 'subscription';
	SubscriptionEvents:
		'status:change' | 'status:ready' | 'status:loadingSubset' | 'loadSubset:error' | 'unsubscribed';
	Subscription: 'status' | 'on' | 'once' | 'off' | 'waitFor' | 'lastError';
	CursorExpressions: 'whereFrom' | 'whereCurrent' | 'lastKey';
	LoadSubsetOptions:
		'where' | 'orderBy' | 'limit' | 'offset' | 'signal' | 'subscription' | 'cursor';
	LoadSubsetRequestResult: never;
	LoadSubsetFn: 1;
	SyncAppliedReceipt: never;
	UnloadSubsetFn: 1;
	CleanupFn: 0;
	SyncConfigRes: 'cleanup' | 'loadSubset' | 'unloadSubset';
	SyncConfig:
		| 'sync'
		| 'getSyncMetadata'
		| 'exportSyncMeta'
		| 'importSyncMeta'
		| 'mergeSyncMeta'
		| 'rowUpdateMode';
	SyncMetadataApi: 'collection' | 'row';
	ChangeMessage: 'metadata' | 'value' | 'previousValue' | 'type' | 'key';
	DeleteKeyMessage: 'metadata' | 'type' | 'key';
	ChangeMessageOrDeleteKeyMessage: 'metadata' | 'type';
	OptimisticChangeMessage: 'metadata' | 'type' | 'key' | 'isActive';
	StandardSchema: '~standard';
	StandardSchemaAlias: '~standard';
	OperationConfig: 'metadata' | 'optimistic';
	InsertConfig: 'metadata' | 'optimistic';
	UpdateMutationFnParams: 'collection' | 'transaction';
	InsertMutationFnParams: 'collection' | 'transaction';
	DeleteMutationFnParams: 'collection' | 'transaction';
	InsertMutationFn: 1;
	UpdateMutationFn: 1;
	DeleteMutationFn: 1;
	CollectionStatus: 'error' | 'idle' | 'loading' | 'ready' | 'cleaned-up';
	SyncMode: 'eager' | 'on-demand';
	BaseCollectionConfig:
		| 'utils'
		| 'id'
		| 'onUpdate'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'autoIndex'
		| 'defaultIndexType'
		| 'compare'
		| 'syncMode'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation';
	CollectionConfig:
		| 'utils'
		| 'id'
		| 'onUpdate'
		| 'sync'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'autoIndex'
		| 'defaultIndexType'
		| 'compare'
		| 'syncMode'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation';
	SingleResult: 'singleResult';
	NonSingleResult: 'singleResult';
	MaybeSingleResult: 'singleResult';
	CollectionConfigSingleRowOption:
		| 'utils'
		| 'singleResult'
		| 'id'
		| 'onUpdate'
		| 'sync'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'autoIndex'
		| 'defaultIndexType'
		| 'compare'
		| 'syncMode'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation';
	ChangesPayload:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with';
	InputRow:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| '0'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with'
		| '1';
	KeyedStream: 'writer' | 'connectReader' | 'graph' | 'pipe';
	ResultStream: 'writer' | 'connectReader' | 'graph' | 'pipe';
	NamespacedRow: string;
	KeyedNamespacedRow:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| '0'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with'
		| '1';
	NamespacedAndKeyedStream: 'writer' | 'connectReader' | 'graph' | 'pipe';
	SubscribeChangesOptions:
		| 'where'
		| 'orderBy'
		| 'limit'
		| 'includeInitialState'
		| 'whereExpression'
		| 'onStatusChange'
		| 'onLoadSubsetResult'
		| 'onLoadSubsetError'
		| 'truncateReplayPublication';
	SubscribeChangesSnapshotOptions:
		| 'where'
		| 'orderBy'
		| 'limit'
		| 'whereExpression'
		| 'onStatusChange'
		| 'onLoadSubsetResult'
		| 'onLoadSubsetError'
		| 'truncateReplayPublication';
	CurrentStateAsChangesOptions: 'where' | 'orderBy' | 'limit' | 'optimizedOnly';
	ChangeListener: 1;
	WritableDeep: 'id' | 'name';
	MakeOptional: 'id' | 'name';
	createChangeProxy: 1 | 2;
	createArrayChangeProxy: 1;
	withChangeTracking: 2;
	withArrayChangeTracking: 2;
	BaseQueryBuilder:
		| 'join'
		| 'from'
		| 'unionAll'
		| '_getQuery'
		| 'leftJoin'
		| 'rightJoin'
		| 'innerJoin'
		| 'fullJoin'
		| 'where'
		| 'having'
		| 'select'
		| 'orderBy'
		| 'groupBy'
		| 'limit'
		| 'offset'
		| 'distinct'
		| 'findOne'
		| 'fn';
	Query: 'from' | 'unionAll';
	InitialQueryBuilder: 'from' | 'unionAll';
	QueryBuilder:
		| 'join'
		| 'leftJoin'
		| 'rightJoin'
		| 'innerJoin'
		| 'fullJoin'
		| 'where'
		| 'having'
		| 'select'
		| 'orderBy'
		| 'groupBy'
		| 'limit'
		| 'offset'
		| 'distinct'
		| 'findOne'
		| 'fn';
	Context:
		| 'singleResult'
		| 'schema'
		| 'hasResult'
		| 'hasUnionFrom'
		| 'fromSourceNames'
		| 'refsSchema'
		| 'baseSchema'
		| 'fromSourceName'
		| 'hasJoins'
		| 'joinTypes'
		| 'result';
	ContextSchema: string;
	Source: string | number;
	GetResult: never;
	InferResultType:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with';
	ExtractContext:
		| 'singleResult'
		| 'schema'
		| 'hasResult'
		| 'hasUnionFrom'
		| 'fromSourceNames'
		| 'refsSchema'
		| 'baseSchema'
		| 'fromSourceName'
		| 'hasJoins'
		| 'joinTypes'
		| 'result';
	QueryResult: never;
	ContextFromSource: 'schema' | 'baseSchema' | 'fromSourceName' | 'hasJoins';
	ContextFromUnionBranches:
		'schema' | 'hasResult' | 'refsSchema' | 'baseSchema' | 'fromSourceName' | 'hasJoins' | 'result';
	ContextFromUnionSource: 'schema' | 'baseSchema' | 'fromSourceName' | 'hasJoins';
	SchemaFromSource: 'people';
	SingleSource: 'people';
	InferCollectionType: 'id' | '$synced' | '$origin' | '$key' | '$collectionId' | 'name';
	MergeContextWithJoinType:
		'schema' | 'refsSchema' | 'baseSchema' | 'fromSourceName' | 'hasJoins' | 'joinTypes' | 'result';
	MergeContextForJoinCallback:
		'schema' | 'refsSchema' | 'baseSchema' | 'fromSourceName' | 'hasJoins' | 'joinTypes' | 'result';
	ApplyJoinOptionalityToMergedSchema: 'people';
	ResultTypeFromSelect: 'name';
	WithResult:
		| 'singleResult'
		| 'schema'
		| 'hasResult'
		| 'hasUnionFrom'
		| 'fromSourceNames'
		| 'refsSchema'
		| 'baseSchema'
		| 'fromSourceName'
		| 'hasJoins'
		| 'joinTypes'
		| 'result';
	JoinOnCallback: 1;
	RefsForContext: string;
	WhereCallback: 1;
	OrderByCallback: 1;
	GroupByCallback: 1;
	SelectObject: string | number;
	FunctionalHavingRow: string;
	Prettify: 'id' | 'name';
	eq: 2;
	gt: 2;
	gte: 2;
	lt: 2;
	lte: 2;
	and: number;
	or: number;
	not: 1;
	inArray: 2;
	like: 2;
	ilike: 2;
	isUndefined: 1;
	isNull: 1;
	upper: 1;
	lower: 1;
	length: 1;
	concat: number;
	coalesce: number;
	caseWhen: number;
	add: 2;
	subtract: 2;
	multiply: 2;
	divide: 2;
	count: 1;
	avg: 1;
	sum: 1;
	min: 1;
	max: 1;
	toArray: 1;
	materialize: 1;
	Ref: string | number | symbol;
	compileQuery: 8 | 9 | 10 | 11 | 12;
	compileExpression: 1 | 2;
	compileSingleRowExpression: 1;
	toBooleanPredicate: 1;
	createLiveQueryCollection: 1;
	liveQueryCollectionOptions: 1;
	queryOnce: 1;
	QueryOnceConfig: 'query';
	LiveQueryCollectionConfig:
		| 'singleResult'
		| 'id'
		| 'query'
		| 'onUpdate'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation';
	LiveQueryCollectionUtils:
		| string
		| typeof import('../node_modules/@tanstack/db/dist/esm/query/live/internal').LIVE_QUERY_INTERNAL;
	UnhashableQueryIRError: 'name' | 'message' | 'path' | 'reason' | 'stack' | 'cause';
	canonicalizeQueryIR: 1;
	getLoadSubsetDemandKey: 1;
	getQueryIdentity: 1;
	getStableQueryBuilderHash: 1;
	getStableQueryIRHash: 1;
	getStableValueHash: 1 | 2;
	DemandKey: number;
	QueryIdentity: number;
	DeduplicatedLoadSubset: 'loadSubset' | 'reset';
	createOptimisticAction: 1;
	isCollection: 1;
	isSingleResultCollection: 1;
	getLiveQueryStatusFlags: 1;
	LiveQueryStatusFlags: 'isReady' | 'isLoading' | 'isIdle' | 'isError' | 'isCleanedUp';
	createLiveQueryObserver: 1 | 2;
	LiveQuerySnapshot:
		| 'status'
		| 'isReady'
		| 'state'
		| 'collection'
		| 'isLoading'
		| 'isIdle'
		| 'isError'
		| 'isCleanedUp'
		| 'data'
		| 'layoutRevision'
		| 'isEnabled';
	LiveQueryObserverListener: 1;
	LiveQueryObserver:
		| 'preload'
		| 'dispose'
		| 'dehydrate'
		| 'subscribe'
		| 'getSnapshot'
		| 'getServerSnapshot'
		| 'getError';
	CreateLiveQueryObserverOptions: 'queryHash' | 'mode' | 'client' | 'onPreload';
	prepareLiveQueryValue: 3;
	getPreparedLiveQueryIdentity: 1;
	getLiveQueryHash: 1 | 2;
	LiveQueryOptions:
		| 'singleResult'
		| 'id'
		| 'query'
		| 'onUpdate'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation'
		| 'queryKey';
	DeferredLiveQueryCollections:
		| typeof Symbol.iterator
		| 'has'
		| 'size'
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'delete'
		| typeof Symbol.toStringTag
		| 'add'
		| 'clear'
		| 'union'
		| 'intersection'
		| 'difference'
		| 'symmetricDifference'
		| 'isSubsetOf'
		| 'isSupersetOf'
		| 'isDisjointFrom';
	getLiveQueryWindowInputKind: 1;
	resolveLiveQueryWindowInput: 1;
	normalizeLiveQueryWindowPageSize: 1;
	hasLiveQueryWindowLeases: 1;
	assertLiveQueryWindowManyResult: 1;
	isLiveQueryWindowCollection: 1;
	getLiveQueryWindowCollectionWarning: 2;
	compareLiveQueryWindowDependencies: 2;
	shouldPreserveLiveQueryWindowPageCount: 1;
	fetchNextLiveQueryWindowPage: 1;
	createLiveQueryWindowController: 1 | 2;
	LiveQueryWindowInputKind: 'query' | 'collection';
	ResolvedLiveQueryWindowInput: 'kind';
	LiveQueryWindowCollection:
		| typeof Symbol.iterator
		| 'utils'
		| 'singleResult'
		| 'id'
		| 'config'
		| '_lifecycle'
		| '_sync'
		| '_state'
		| 'deferDataRefresh'
		| 'status'
		| 'subscriberCount'
		| '_stateRevision'
		| '_layoutRevision'
		| '_subscribeLayoutChanges'
		| '_markLayoutChange'
		| '_deferPublication'
		| 'onFirstReady'
		| 'isReady'
		| 'isLoadingSubset'
		| 'startSyncImmediate'
		| '_setTransactionScope'
		| '_hasHydratedKey'
		| '_deferSyncStart'
		| '_resumeSyncStart'
		| 'preload'
		| 'get'
		| 'has'
		| 'size'
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| 'getKeyFromItem'
		| 'createIndex'
		| 'removeIndex'
		| 'getIndexMetadata'
		| 'indexes'
		| 'validateData'
		| 'compareOptions'
		| 'insert'
		| 'update'
		| 'delete'
		| 'state'
		| 'stateWhenReady'
		| 'toArray'
		| 'toArrayWhenReady'
		| 'currentStateAsChanges'
		| 'subscribeChanges'
		| 'on'
		| 'once'
		| 'off'
		| 'waitFor'
		| 'cleanup';
	LiveQueryWindowSnapshot:
		| 'status'
		| 'isReady'
		| 'state'
		| 'error'
		| 'collection'
		| 'isLoading'
		| 'isIdle'
		| 'isError'
		| 'isCleanedUp'
		| 'data'
		| 'isEnabled'
		| 'pages'
		| 'pageParams'
		| 'hasNextPage'
		| 'isFetchingNextPage';
	CreateLiveQueryWindowControllerOptions: 'pageSize' | 'initialPageParam' | 'initialPageCount';
	LiveQueryWindowController:
		'preload' | 'dispose' | 'subscribe' | 'reset' | 'getSnapshot' | 'fetchNextPage';
	localOnlyCollectionOptions: 1;
	LocalOnlyCollectionConfig:
		| 'utils'
		| 'id'
		| 'onUpdate'
		| 'schema'
		| 'getKey'
		| 'autoIndex'
		| 'defaultIndexType'
		| 'compare'
		| 'syncMode'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation'
		| 'initialData';
	LocalOnlyCollectionUtils: string | number;
	localStorageCollectionOptions: 1;
	StorageApi: 'getItem' | 'setItem' | 'removeItem';
	StorageEventApi: 'addEventListener' | 'removeEventListener';
	Parser: 'parse' | 'stringify';
	LocalStorageCollectionConfig:
		| 'utils'
		| 'id'
		| 'onUpdate'
		| 'schema'
		| 'getKey'
		| 'gcTime'
		| 'startSync'
		| 'autoIndex'
		| 'defaultIndexType'
		| 'compare'
		| 'syncMode'
		| 'onInsert'
		| 'onDelete'
		| 'defaultStringCollation'
		| 'storageKey'
		| 'storage'
		| 'storageEventApi'
		| 'parser';
	ClearStorageFn: 0;
	GetStorageSizeFn: 0;
	LocalStorageCollectionUtils: string | number;
	TanStackDBError: 'name' | 'message' | 'stack' | 'cause';
	NonRetriableError: 'name' | 'message' | 'stack' | 'cause';
	SchemaValidationError: 'type' | 'name' | 'message' | 'issues' | 'stack' | 'cause';
	DuplicateDbInstanceError: 'name' | 'message' | 'stack' | 'cause';
	CollectionConfigurationError: 'name' | 'message' | 'stack' | 'cause';
	CollectionRequiresConfigError: 'name' | 'message' | 'stack' | 'cause';
	CollectionRequiresSyncConfigError: 'name' | 'message' | 'stack' | 'cause';
	InvalidSchemaError: 'name' | 'message' | 'stack' | 'cause';
	SchemaMustBeSynchronousError: 'name' | 'message' | 'stack' | 'cause';
	CollectionStateError: 'name' | 'message' | 'stack' | 'cause';
	CollectionInErrorStateError: 'name' | 'message' | 'stack' | 'cause';
	InvalidCollectionStatusTransitionError: 'name' | 'message' | 'stack' | 'cause';
	CollectionIsInErrorStateError: 'name' | 'message' | 'stack' | 'cause';
	NegativeActiveSubscribersError: 'name' | 'message' | 'stack' | 'cause';
	LiveQueryObserverDisposedError: 'name' | 'message' | 'stack' | 'cause';
	LiveQueryWindowControllerDisposedError: 'name' | 'message' | 'stack' | 'cause';
	CollectionOperationError: 'name' | 'message' | 'stack' | 'cause';
	UndefinedKeyError: 'name' | 'message' | 'stack' | 'cause';
	InvalidKeyError: 'name' | 'message' | 'stack' | 'cause';
	DuplicateKeyError: 'name' | 'message' | 'stack' | 'cause';
	DuplicateKeySyncError: 'name' | 'message' | 'stack' | 'cause';
	MissingUpdateArgumentError: 'name' | 'message' | 'stack' | 'cause';
	NoKeysPassedToUpdateError: 'name' | 'message' | 'stack' | 'cause';
	UpdateKeyNotFoundError: 'name' | 'message' | 'stack' | 'cause';
	KeyUpdateNotAllowedError: 'name' | 'message' | 'stack' | 'cause';
	NoKeysPassedToDeleteError: 'name' | 'message' | 'stack' | 'cause';
	DeleteKeyNotFoundError: 'name' | 'message' | 'stack' | 'cause';
	MissingHandlerError: 'name' | 'message' | 'stack' | 'cause';
	MissingInsertHandlerError: 'name' | 'message' | 'stack' | 'cause';
	MissingUpdateHandlerError: 'name' | 'message' | 'stack' | 'cause';
	MissingDeleteHandlerError: 'name' | 'message' | 'stack' | 'cause';
	TransactionError: 'name' | 'message' | 'stack' | 'cause';
	MissingMutationFunctionError: 'name' | 'message' | 'stack' | 'cause';
	OnMutateMustBeSynchronousError: 'name' | 'message' | 'stack' | 'cause';
	TransactionNotPendingMutateError: 'name' | 'message' | 'stack' | 'cause';
	TransactionAlreadyCompletedRollbackError: 'name' | 'message' | 'stack' | 'cause';
	TransactionNotPendingCommitError: 'name' | 'message' | 'stack' | 'cause';
	NoPendingSyncTransactionWriteError: 'name' | 'message' | 'stack' | 'cause';
	SyncTransactionAlreadyCommittedWriteError: 'name' | 'message' | 'stack' | 'cause';
	NoPendingSyncTransactionCommitError: 'name' | 'message' | 'stack' | 'cause';
	SyncTransactionAlreadyCommittedError: 'name' | 'message' | 'stack' | 'cause';
	QueryBuilderError: 'name' | 'message' | 'stack' | 'cause';
	OnlyOneSourceAllowedError: 'name' | 'message' | 'stack' | 'cause';
	SubQueryMustHaveFromClauseError: 'name' | 'message' | 'stack' | 'cause';
	InvalidSourceError: 'name' | 'message' | 'stack' | 'cause';
	SourceClauseContext: 'from clause' | 'unionAll clause' | 'join clause';
	InvalidSourceTypeError: 'name' | 'message' | 'stack' | 'cause';
	JoinConditionMustBeEqualityError: 'name' | 'message' | 'stack' | 'cause';
	QueryMustHaveFromClauseError: 'name' | 'message' | 'stack' | 'cause';
	InvalidWhereExpressionError: 'name' | 'message' | 'stack' | 'cause';
	QueryCompilationError: 'name' | 'message' | 'stack' | 'cause';
	UnsafeAliasPathError: 'name' | 'message' | 'stack' | 'cause';
	DistinctRequiresSelectError: 'name' | 'message' | 'stack' | 'cause';
	FnSelectWithGroupByError: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedFnSelectResultError: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedRootScalarSelectError: 'name' | 'message' | 'stack' | 'cause';
	HavingRequiresGroupByError: 'name' | 'message' | 'stack' | 'cause';
	LimitOffsetRequireOrderByError: 'name' | 'message' | 'stack' | 'cause';
	CollectionInputNotFoundError: 'name' | 'message' | 'stack' | 'cause';
	DuplicateAliasInSubqueryError: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedFromTypeError: 'name' | 'message' | 'stack' | 'cause';
	UnknownExpressionTypeError: 'name' | 'message' | 'stack' | 'cause';
	EmptyReferencePathError: 'name' | 'message' | 'stack' | 'cause';
	UnknownFunctionError: 'name' | 'message' | 'stack' | 'cause';
	JoinCollectionNotFoundError: 'name' | 'message' | 'stack' | 'cause';
	JoinError: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedJoinTypeError: 'name' | 'message' | 'stack' | 'cause';
	InvalidJoinConditionSameSourceError: 'name' | 'message' | 'stack' | 'cause';
	InvalidJoinConditionSourceMismatchError: 'name' | 'message' | 'stack' | 'cause';
	InvalidJoinConditionLeftSourceError: 'name' | 'message' | 'stack' | 'cause';
	InvalidJoinConditionRightSourceError: 'name' | 'message' | 'stack' | 'cause';
	InvalidJoinCondition: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedJoinSourceTypeError: 'name' | 'message' | 'stack' | 'cause';
	GroupByError: 'name' | 'message' | 'stack' | 'cause';
	NonAggregateExpressionNotInGroupByError: 'name' | 'message' | 'stack' | 'cause';
	UnsupportedAggregateFunctionError: 'name' | 'message' | 'stack' | 'cause';
	AggregateFunctionNotInSelectError: 'name' | 'message' | 'stack' | 'cause';
	UnknownHavingExpressionTypeError: 'name' | 'message' | 'stack' | 'cause';
	StorageError: 'name' | 'message' | 'stack' | 'cause';
	SerializationError: 'name' | 'message' | 'stack' | 'cause';
	LocalStorageCollectionError: 'name' | 'message' | 'stack' | 'cause';
	StorageKeyRequiredError: 'name' | 'message' | 'stack' | 'cause';
	InvalidStorageDataFormatError: 'name' | 'message' | 'stack' | 'cause';
	InvalidStorageObjectFormatError: 'name' | 'message' | 'stack' | 'cause';
	SyncCleanupError: 'name' | 'message' | 'stack' | 'cause';
	SyncTransactionAbortedError: 'name' | 'message' | 'stack' | 'cause';
	CollectionPreloadAbortedError: 'name' | 'message' | 'stack' | 'cause';
	LoadSubsetOperationAbortedError: 'name' | 'message' | 'stack' | 'cause';
	QueryOptimizerError: 'name' | 'message' | 'stack' | 'cause';
	CannotCombineEmptyExpressionListError: 'name' | 'message' | 'stack' | 'cause';
	MissingAliasInputsError: 'name' | 'message' | 'stack' | 'cause';
	SetWindowRequiresOrderByError: 'name' | 'message' | 'stack' | 'cause';
	SetWindowReentrancyError: 'name' | 'message' | 'stack' | 'cause';
	createPacedMutations: 1;
	PacedMutationsConfig: 'mutationFn' | 'metadata' | 'onMutate' | 'strategy';
	debounceStrategy: 1;
	queueStrategy: 0 | 1;
	throttleStrategy: 1;
	Strategy: 'cleanup' | 'options' | '_type' | 'execute';
	BaseStrategy: 'cleanup' | '_type' | 'execute';
	DebounceStrategy: 'cleanup' | 'options' | '_type' | 'execute';
	DebounceStrategyOptions: 'wait' | 'leading' | 'trailing';
	QueueStrategy: 'cleanup' | 'options' | '_type' | 'execute';
	QueueStrategyOptions: 'wait' | 'maxSize' | 'addItemsTo' | 'getItemsFrom';
	ThrottleStrategy: 'cleanup' | 'options' | '_type' | 'execute';
	ThrottleStrategyOptions: 'wait' | 'leading' | 'trailing';
	StrategyOptions: 'wait' | 'leading' | 'trailing';
	extractFieldPath: 1;
	extractValue: 1;
	walkExpression: 2;
	parseWhereExpression: 2;
	parseOrderByExpression: 1;
	extractSimpleComparisons: 1;
	parseLoadSubsetOptions: 1;
	FieldPath:
		| number
		| typeof Symbol.iterator
		| 'keys'
		| 'values'
		| 'entries'
		| 'forEach'
		| 'map'
		| typeof Symbol.unscopables
		| 'length'
		| 'toString'
		| 'toLocaleString'
		| 'pop'
		| 'push'
		| 'concat'
		| 'join'
		| 'reverse'
		| 'shift'
		| 'slice'
		| 'sort'
		| 'splice'
		| 'unshift'
		| 'indexOf'
		| 'lastIndexOf'
		| 'every'
		| 'some'
		| 'filter'
		| 'reduce'
		| 'reduceRight'
		| 'find'
		| 'findIndex'
		| 'fill'
		| 'copyWithin'
		| 'includes'
		| 'flatMap'
		| 'flat'
		| 'at'
		| 'findLast'
		| 'findLastIndex'
		| 'toReversed'
		| 'toSorted'
		| 'toSpliced'
		| 'with';
	SimpleComparison: 'value' | 'field' | 'operator';
	ParseWhereOptions: 'handlers' | 'onUnknownOperator';
	ParsedOrderBy: 'locale' | 'stringSort' | 'localeOptions' | 'field' | 'direction' | 'nulls';
}
