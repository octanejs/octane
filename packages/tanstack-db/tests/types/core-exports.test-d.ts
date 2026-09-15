import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as Actual from '@octanejs/tanstack-db';
import type * as Witness from '@tanstack/react-db';
import type { ExpectedCoreContracts } from '../../typetests/expected-core-contracts';
type Person = { id: string; name: string };
type Contract_Collection = Assert<
	Equal<keyof Actual.Collection, ExpectedCoreContracts['Collection']>
>;
type Contract_createTransaction = Assert<
	Equal<
		Parameters<typeof Actual.createTransaction>['length'],
		ExpectedCoreContracts['createTransaction']
	>
>;
type Contract_withCollectionConfigFactory = Assert<
	Equal<
		Parameters<typeof Actual.withCollectionConfigFactory>['length'],
		ExpectedCoreContracts['withCollectionConfigFactory']
	>
>;
type Contract_deepEquals = Assert<
	Equal<Parameters<typeof Actual.deepEquals>['length'], ExpectedCoreContracts['deepEquals']>
>;
type Contract_VirtualRowProps = Assert<
	Equal<keyof Actual.VirtualRowProps, ExpectedCoreContracts['VirtualRowProps']>
>;
type Contract_VirtualOrigin = Assert<
	Equal<Actual.VirtualOrigin, ExpectedCoreContracts['VirtualOrigin']>
>;
type Contract_WithVirtualProps = Assert<
	Equal<keyof Actual.WithVirtualProps<Person>, ExpectedCoreContracts['WithVirtualProps']>
>;
type Contract_WithoutVirtualProps = Assert<
	Equal<
		keyof Actual.WithoutVirtualProps<Person & Witness.VirtualRowProps<string>>,
		ExpectedCoreContracts['WithoutVirtualProps']
	>
>;
type Contract_hasVirtualProps = Assert<
	Equal<
		Parameters<typeof Actual.hasVirtualProps>['length'],
		ExpectedCoreContracts['hasVirtualProps']
	>
>;
type Contract_BaseIndex = Assert<
	Equal<keyof InstanceType<typeof Actual.BaseIndex>, ExpectedCoreContracts['BaseIndex']>
>;
type Contract_IndexInterface = Assert<
	Equal<keyof Actual.IndexInterface, ExpectedCoreContracts['IndexInterface']>
>;
type Contract_IndexConstructor = Assert<
	Equal<
		ConstructorParameters<Actual.IndexConstructor>['length'],
		ExpectedCoreContracts['IndexConstructor']
	>
>;
type Contract_IndexOperation = Assert<
	Equal<keyof typeof Actual.IndexOperation, ExpectedCoreContracts['IndexOperation']>
>;
type Contract_IndexReader = Assert<
	Equal<keyof Actual.IndexReader, ExpectedCoreContracts['IndexReader']>
>;
type Contract_IndexOptions = Assert<
	Equal<keyof Actual.IndexOptions, ExpectedCoreContracts['IndexOptions']>
>;
type Contract_BasicIndex = Assert<
	Equal<keyof InstanceType<typeof Actual.BasicIndex>, ExpectedCoreContracts['BasicIndex']>
>;
type Contract_BasicIndexOptions = Assert<
	Equal<keyof Actual.BasicIndexOptions, ExpectedCoreContracts['BasicIndexOptions']>
>;
type Contract_RangeQueryOptions = Assert<
	Equal<keyof Actual.RangeQueryOptions, ExpectedCoreContracts['RangeQueryOptions']>
>;
type Contract_BTreeIndex = Assert<
	Equal<keyof InstanceType<typeof Actual.BTreeIndex>, ExpectedCoreContracts['BTreeIndex']>
>;
type Contract_BTreeRangeQueryOptions = Assert<
	Equal<keyof Actual.BTreeRangeQueryOptions, ExpectedCoreContracts['BTreeRangeQueryOptions']>
>;
type Contract_ReverseIndex = Assert<
	Equal<keyof InstanceType<typeof Actual.ReverseIndex>, ExpectedCoreContracts['ReverseIndex']>
>;
type Contract_optimizeExpressionWithIndexes = Assert<
	Equal<
		Parameters<typeof Actual.optimizeExpressionWithIndexes>['length'],
		ExpectedCoreContracts['optimizeExpressionWithIndexes']
	>
>;
type Contract_findIndexForField = Assert<
	Equal<
		Parameters<typeof Actual.findIndexForField>['length'],
		ExpectedCoreContracts['findIndexForField']
	>
>;
type Contract_configureIndexDevMode = Assert<
	Equal<
		Parameters<typeof Actual.configureIndexDevMode>['length'],
		ExpectedCoreContracts['configureIndexDevMode']
	>
>;
type Contract_isDevModeEnabled = Assert<
	Equal<
		Parameters<typeof Actual.isDevModeEnabled>['length'],
		ExpectedCoreContracts['isDevModeEnabled']
	>
>;
type Contract_getIndexDevModeConfig = Assert<
	Equal<
		Parameters<typeof Actual.getIndexDevModeConfig>['length'],
		ExpectedCoreContracts['getIndexDevModeConfig']
	>
>;
type Contract_trackQuery = Assert<
	Equal<Parameters<typeof Actual.trackQuery>['length'], ExpectedCoreContracts['trackQuery']>
>;
type Contract_clearQueryPatterns = Assert<
	Equal<
		Parameters<typeof Actual.clearQueryPatterns>['length'],
		ExpectedCoreContracts['clearQueryPatterns']
	>
>;
type Contract_getQueryPatterns = Assert<
	Equal<
		Parameters<typeof Actual.getQueryPatterns>['length'],
		ExpectedCoreContracts['getQueryPatterns']
	>
>;
type Contract_IndexDevModeConfig = Assert<
	Equal<keyof Actual.IndexDevModeConfig, ExpectedCoreContracts['IndexDevModeConfig']>
>;
type Contract_IndexSuggestion = Assert<
	Equal<keyof Actual.IndexSuggestion, ExpectedCoreContracts['IndexSuggestion']>
>;
type Contract_createEffect = Assert<
	Equal<Parameters<typeof Actual.createEffect>['length'], ExpectedCoreContracts['createEffect']>
>;
type Contract_DeltaEvent = Assert<
	Equal<keyof Actual.DeltaEvent, ExpectedCoreContracts['DeltaEvent']>
>;
type Contract_DeltaType = Assert<Equal<Actual.DeltaType, ExpectedCoreContracts['DeltaType']>>;
type Contract_EffectConfig = Assert<
	Equal<keyof Actual.EffectConfig, ExpectedCoreContracts['EffectConfig']>
>;
type Contract_EffectContext = Assert<
	Equal<keyof Actual.EffectContext, ExpectedCoreContracts['EffectContext']>
>;
type Contract_Effect = Assert<Equal<keyof Actual.Effect, ExpectedCoreContracts['Effect']>>;
type Contract_EffectQueryInput = Assert<
	Equal<keyof Actual.EffectQueryInput<Witness.Context>, ExpectedCoreContracts['EffectQueryInput']>
>;
type Contract_safeRandomUUID = Assert<
	Equal<Parameters<typeof Actual.safeRandomUUID>['length'], ExpectedCoreContracts['safeRandomUUID']>
>;
type Contract_IR = Assert<Equal<keyof typeof Actual.IR, ExpectedCoreContracts['IR']>>;
type Contract_operators = Assert<
	Equal<keyof typeof Actual.operators, ExpectedCoreContracts['operators']>
>;
type Contract_OperatorName = Assert<
	Equal<Actual.OperatorName, ExpectedCoreContracts['OperatorName']>
>;
type Contract_createCollection = Assert<
	Equal<
		Parameters<typeof Actual.createCollection>['length'],
		ExpectedCoreContracts['createCollection']
	>
>;
type Contract_CollectionIndexMetadata = Assert<
	Equal<keyof Actual.CollectionIndexMetadata, ExpectedCoreContracts['CollectionIndexMetadata']>
>;
type Contract_CollectionImpl = Assert<
	Equal<keyof InstanceType<typeof Actual.CollectionImpl>, ExpectedCoreContracts['CollectionImpl']>
>;
type Contract_SortedMap = Assert<
	Equal<keyof InstanceType<typeof Actual.SortedMap>, ExpectedCoreContracts['SortedMap']>
>;
type Contract_getActiveTransaction = Assert<
	Equal<
		Parameters<typeof Actual.getActiveTransaction>['length'],
		ExpectedCoreContracts['getActiveTransaction']
	>
>;
type Contract_TransactionScope = Assert<
	Equal<
		keyof InstanceType<typeof Actual.TransactionScope>,
		ExpectedCoreContracts['TransactionScope']
	>
>;
type Contract_Transaction = Assert<
	Equal<keyof InstanceType<typeof Actual.Transaction>, ExpectedCoreContracts['Transaction']>
>;
type Contract_collectionOptions = Assert<
	Equal<
		Parameters<typeof Actual.collectionOptions>['length'],
		ExpectedCoreContracts['collectionOptions']
	>
>;
type Contract_isCollectionOptions = Assert<
	Equal<
		Parameters<typeof Actual.isCollectionOptions>['length'],
		ExpectedCoreContracts['isCollectionOptions']
	>
>;
type Contract_CollectionOptions = Assert<
	Equal<keyof Actual.CollectionOptions, ExpectedCoreContracts['CollectionOptions']>
>;
type Contract_CollectionMaterializeOptions = Assert<
	Equal<
		keyof Actual.CollectionMaterializeOptions<Person>,
		ExpectedCoreContracts['CollectionMaterializeOptions']
	>
>;
type Contract_DehydratedCollectionRow = Assert<
	Equal<keyof Actual.DehydratedCollectionRow, ExpectedCoreContracts['DehydratedCollectionRow']>
>;
type Contract_DehydratedCollectionChunk = Assert<
	Equal<keyof Actual.DehydratedCollectionChunk, ExpectedCoreContracts['DehydratedCollectionChunk']>
>;
type Contract_DehydratedLiveQuery = Assert<
	Equal<keyof Actual.DehydratedLiveQuery, ExpectedCoreContracts['DehydratedLiveQuery']>
>;
type Contract_DehydratedLiveQueryResult = Assert<
	Equal<keyof Actual.DehydratedLiveQueryResult, ExpectedCoreContracts['DehydratedLiveQueryResult']>
>;
type Contract_DehydratedDbState = Assert<
	Equal<keyof Actual.DehydratedDbState, ExpectedCoreContracts['DehydratedDbState']>
>;
type Contract_DbClientLiveQueryState = Assert<
	Equal<Actual.DbClientLiveQueryState, ExpectedCoreContracts['DbClientLiveQueryState']>
>;
type Contract_DbClientLiveQuery = Assert<
	Equal<keyof Actual.DbClientLiveQuery, ExpectedCoreContracts['DbClientLiveQuery']>
>;
type Contract_DbClientEvent = Assert<
	Equal<keyof Actual.DbClientEvent, ExpectedCoreContracts['DbClientEvent']>
>;
type Contract_DehydrateDbClientOptions = Assert<
	Equal<keyof Actual.DehydrateDbClientOptions, ExpectedCoreContracts['DehydrateDbClientOptions']>
>;
type Contract_DbClientOptions = Assert<
	Equal<keyof Actual.DbClientOptions, ExpectedCoreContracts['DbClientOptions']>
>;
type Contract_DbClient = Assert<
	Equal<keyof InstanceType<typeof Actual.DbClient>, ExpectedCoreContracts['DbClient']>
>;
type Contract_CollectionLike = Assert<
	Equal<keyof Actual.CollectionLike, ExpectedCoreContracts['CollectionLike']>
>;
type Contract_StringCollationConfig = Assert<
	Equal<keyof Actual.StringCollationConfig, ExpectedCoreContracts['StringCollationConfig']>
>;
type Contract_InferSchemaOutput = Assert<
	Equal<
		keyof Actual.InferSchemaOutput<Witness.StandardSchemaAlias<Person>>,
		ExpectedCoreContracts['InferSchemaOutput']
	>
>;
type Contract_InferSchemaInput = Assert<
	Equal<
		keyof Actual.InferSchemaInput<Witness.StandardSchemaAlias<Person>>,
		ExpectedCoreContracts['InferSchemaInput']
	>
>;
type Contract_TransactionState = Assert<
	Equal<Actual.TransactionState, ExpectedCoreContracts['TransactionState']>
>;
type Contract_Fn = Assert<Equal<Parameters<Actual.Fn>['length'], ExpectedCoreContracts['Fn']>>;
type Contract_UtilsRecord = Assert<
	Equal<keyof Actual.UtilsRecord, ExpectedCoreContracts['UtilsRecord']>
>;
type Contract_ResolveTransactionChanges = Assert<
	Equal<keyof Actual.ResolveTransactionChanges, ExpectedCoreContracts['ResolveTransactionChanges']>
>;
type Contract_PendingMutation = Assert<
	Equal<keyof Actual.PendingMutation, ExpectedCoreContracts['PendingMutation']>
>;
type Contract_MutationFnParams = Assert<
	Equal<keyof Actual.MutationFnParams, ExpectedCoreContracts['MutationFnParams']>
>;
type Contract_MutationFn = Assert<
	Equal<Parameters<Actual.MutationFn>['length'], ExpectedCoreContracts['MutationFn']>
>;
type Contract_NonEmptyArray = Assert<
	Equal<keyof Actual.NonEmptyArray<Person>, ExpectedCoreContracts['NonEmptyArray']>
>;
type Contract_TransactionWithMutations = Assert<
	Equal<keyof Actual.TransactionWithMutations, ExpectedCoreContracts['TransactionWithMutations']>
>;
type Contract_TransactionConfig = Assert<
	Equal<keyof Actual.TransactionConfig, ExpectedCoreContracts['TransactionConfig']>
>;
type Contract_CreateOptimisticActionsOptions = Assert<
	Equal<
		keyof Actual.CreateOptimisticActionsOptions,
		ExpectedCoreContracts['CreateOptimisticActionsOptions']
	>
>;
type Contract_Row = Assert<Equal<keyof Actual.Row, ExpectedCoreContracts['Row']>>;
type Contract_OperationType = Assert<
	Equal<Actual.OperationType, ExpectedCoreContracts['OperationType']>
>;
type Contract_SubscriptionStatus = Assert<
	Equal<Actual.SubscriptionStatus, ExpectedCoreContracts['SubscriptionStatus']>
>;
type Contract_SubscriptionStatusChangeEvent = Assert<
	Equal<
		keyof Actual.SubscriptionStatusChangeEvent,
		ExpectedCoreContracts['SubscriptionStatusChangeEvent']
	>
>;
type Contract_SubscriptionStatusEvent = Assert<
	Equal<
		keyof Actual.SubscriptionStatusEvent<Witness.SubscriptionStatus>,
		ExpectedCoreContracts['SubscriptionStatusEvent']
	>
>;
type Contract_SubscriptionLoadSubsetErrorEvent = Assert<
	Equal<
		keyof Actual.SubscriptionLoadSubsetErrorEvent,
		ExpectedCoreContracts['SubscriptionLoadSubsetErrorEvent']
	>
>;
type Contract_SubscriptionUnsubscribedEvent = Assert<
	Equal<
		keyof Actual.SubscriptionUnsubscribedEvent,
		ExpectedCoreContracts['SubscriptionUnsubscribedEvent']
	>
>;
type Contract_SubscriptionEvents = Assert<
	Equal<keyof Actual.SubscriptionEvents, ExpectedCoreContracts['SubscriptionEvents']>
>;
type Contract_Subscription = Assert<
	Equal<keyof Actual.Subscription, ExpectedCoreContracts['Subscription']>
>;
type Contract_CursorExpressions = Assert<
	Equal<keyof Actual.CursorExpressions, ExpectedCoreContracts['CursorExpressions']>
>;
type Contract_LoadSubsetOptions = Assert<
	Equal<keyof Actual.LoadSubsetOptions, ExpectedCoreContracts['LoadSubsetOptions']>
>;
type Contract_LoadSubsetRequestResult = Assert<
	Equal<keyof Actual.LoadSubsetRequestResult, ExpectedCoreContracts['LoadSubsetRequestResult']>
>;
type Contract_LoadSubsetFn = Assert<
	Equal<Parameters<Actual.LoadSubsetFn>['length'], ExpectedCoreContracts['LoadSubsetFn']>
>;
type Contract_SyncAppliedReceipt = Assert<
	Equal<keyof Actual.SyncAppliedReceipt, ExpectedCoreContracts['SyncAppliedReceipt']>
>;
type Contract_UnloadSubsetFn = Assert<
	Equal<Parameters<Actual.UnloadSubsetFn>['length'], ExpectedCoreContracts['UnloadSubsetFn']>
>;
type Contract_CleanupFn = Assert<
	Equal<Parameters<Actual.CleanupFn>['length'], ExpectedCoreContracts['CleanupFn']>
>;
type Contract_SyncConfigRes = Assert<
	Equal<keyof Actual.SyncConfigRes, ExpectedCoreContracts['SyncConfigRes']>
>;
type Contract_SyncConfig = Assert<
	Equal<keyof Actual.SyncConfig, ExpectedCoreContracts['SyncConfig']>
>;
type Contract_SyncMetadataApi = Assert<
	Equal<keyof Actual.SyncMetadataApi, ExpectedCoreContracts['SyncMetadataApi']>
>;
type Contract_ChangeMessage = Assert<
	Equal<keyof Actual.ChangeMessage, ExpectedCoreContracts['ChangeMessage']>
>;
type Contract_DeleteKeyMessage = Assert<
	Equal<keyof Actual.DeleteKeyMessage, ExpectedCoreContracts['DeleteKeyMessage']>
>;
type Contract_ChangeMessageOrDeleteKeyMessage = Assert<
	Equal<
		keyof Actual.ChangeMessageOrDeleteKeyMessage,
		ExpectedCoreContracts['ChangeMessageOrDeleteKeyMessage']
	>
>;
type Contract_OptimisticChangeMessage = Assert<
	Equal<keyof Actual.OptimisticChangeMessage, ExpectedCoreContracts['OptimisticChangeMessage']>
>;
type Contract_StandardSchema = Assert<
	Equal<keyof Actual.StandardSchema<Person>, ExpectedCoreContracts['StandardSchema']>
>;
type Contract_StandardSchemaAlias = Assert<
	Equal<keyof Actual.StandardSchemaAlias, ExpectedCoreContracts['StandardSchemaAlias']>
>;
type Contract_OperationConfig = Assert<
	Equal<keyof Actual.OperationConfig, ExpectedCoreContracts['OperationConfig']>
>;
type Contract_InsertConfig = Assert<
	Equal<keyof Actual.InsertConfig, ExpectedCoreContracts['InsertConfig']>
>;
type Contract_UpdateMutationFnParams = Assert<
	Equal<keyof Actual.UpdateMutationFnParams, ExpectedCoreContracts['UpdateMutationFnParams']>
>;
type Contract_InsertMutationFnParams = Assert<
	Equal<keyof Actual.InsertMutationFnParams, ExpectedCoreContracts['InsertMutationFnParams']>
>;
type Contract_DeleteMutationFnParams = Assert<
	Equal<keyof Actual.DeleteMutationFnParams, ExpectedCoreContracts['DeleteMutationFnParams']>
>;
type Contract_InsertMutationFn = Assert<
	Equal<Parameters<Actual.InsertMutationFn>['length'], ExpectedCoreContracts['InsertMutationFn']>
>;
type Contract_UpdateMutationFn = Assert<
	Equal<Parameters<Actual.UpdateMutationFn>['length'], ExpectedCoreContracts['UpdateMutationFn']>
>;
type Contract_DeleteMutationFn = Assert<
	Equal<Parameters<Actual.DeleteMutationFn>['length'], ExpectedCoreContracts['DeleteMutationFn']>
>;
type Contract_CollectionStatus = Assert<
	Equal<Actual.CollectionStatus, ExpectedCoreContracts['CollectionStatus']>
>;
type Contract_SyncMode = Assert<Equal<Actual.SyncMode, ExpectedCoreContracts['SyncMode']>>;
type Contract_BaseCollectionConfig = Assert<
	Equal<keyof Actual.BaseCollectionConfig, ExpectedCoreContracts['BaseCollectionConfig']>
>;
type Contract_CollectionConfig = Assert<
	Equal<keyof Actual.CollectionConfig, ExpectedCoreContracts['CollectionConfig']>
>;
type Contract_SingleResult = Assert<
	Equal<keyof Actual.SingleResult, ExpectedCoreContracts['SingleResult']>
>;
type Contract_NonSingleResult = Assert<
	Equal<keyof Actual.NonSingleResult, ExpectedCoreContracts['NonSingleResult']>
>;
type Contract_MaybeSingleResult = Assert<
	Equal<keyof Actual.MaybeSingleResult, ExpectedCoreContracts['MaybeSingleResult']>
>;
type Contract_CollectionConfigSingleRowOption = Assert<
	Equal<
		keyof Actual.CollectionConfigSingleRowOption,
		ExpectedCoreContracts['CollectionConfigSingleRowOption']
	>
>;
type Contract_ChangesPayload = Assert<
	Equal<keyof Actual.ChangesPayload, ExpectedCoreContracts['ChangesPayload']>
>;
type Contract_InputRow = Assert<Equal<keyof Actual.InputRow, ExpectedCoreContracts['InputRow']>>;
type Contract_KeyedStream = Assert<
	Equal<keyof Actual.KeyedStream, ExpectedCoreContracts['KeyedStream']>
>;
type Contract_ResultStream = Assert<
	Equal<keyof Actual.ResultStream, ExpectedCoreContracts['ResultStream']>
>;
type Contract_NamespacedRow = Assert<
	Equal<keyof Actual.NamespacedRow, ExpectedCoreContracts['NamespacedRow']>
>;
type Contract_KeyedNamespacedRow = Assert<
	Equal<keyof Actual.KeyedNamespacedRow, ExpectedCoreContracts['KeyedNamespacedRow']>
>;
type Contract_NamespacedAndKeyedStream = Assert<
	Equal<keyof Actual.NamespacedAndKeyedStream, ExpectedCoreContracts['NamespacedAndKeyedStream']>
>;
type Contract_SubscribeChangesOptions = Assert<
	Equal<keyof Actual.SubscribeChangesOptions, ExpectedCoreContracts['SubscribeChangesOptions']>
>;
type Contract_SubscribeChangesSnapshotOptions = Assert<
	Equal<
		keyof Actual.SubscribeChangesSnapshotOptions,
		ExpectedCoreContracts['SubscribeChangesSnapshotOptions']
	>
>;
type Contract_CurrentStateAsChangesOptions = Assert<
	Equal<
		keyof Actual.CurrentStateAsChangesOptions,
		ExpectedCoreContracts['CurrentStateAsChangesOptions']
	>
>;
type Contract_ChangeListener = Assert<
	Equal<Parameters<Actual.ChangeListener>['length'], ExpectedCoreContracts['ChangeListener']>
>;
type Contract_WritableDeep = Assert<
	Equal<keyof Actual.WritableDeep<Person>, ExpectedCoreContracts['WritableDeep']>
>;
type Contract_MakeOptional = Assert<
	Equal<keyof Actual.MakeOptional<Person, 'name'>, ExpectedCoreContracts['MakeOptional']>
>;
type Contract_createChangeProxy = Assert<
	Equal<
		Parameters<typeof Actual.createChangeProxy>['length'],
		ExpectedCoreContracts['createChangeProxy']
	>
>;
type Contract_createArrayChangeProxy = Assert<
	Equal<
		Parameters<typeof Actual.createArrayChangeProxy>['length'],
		ExpectedCoreContracts['createArrayChangeProxy']
	>
>;
type Contract_withChangeTracking = Assert<
	Equal<
		Parameters<typeof Actual.withChangeTracking>['length'],
		ExpectedCoreContracts['withChangeTracking']
	>
>;
type Contract_withArrayChangeTracking = Assert<
	Equal<
		Parameters<typeof Actual.withArrayChangeTracking>['length'],
		ExpectedCoreContracts['withArrayChangeTracking']
	>
>;
type Contract_BaseQueryBuilder = Assert<
	Equal<
		keyof InstanceType<typeof Actual.BaseQueryBuilder>,
		ExpectedCoreContracts['BaseQueryBuilder']
	>
>;
type Contract_Query = Assert<
	Equal<keyof InstanceType<typeof Actual.Query>, ExpectedCoreContracts['Query']>
>;
type Contract_InitialQueryBuilder = Assert<
	Equal<keyof Actual.InitialQueryBuilder, ExpectedCoreContracts['InitialQueryBuilder']>
>;
type Contract_QueryBuilder = Assert<
	Equal<keyof Actual.QueryBuilder<Witness.Context>, ExpectedCoreContracts['QueryBuilder']>
>;
type Contract_Context = Assert<Equal<keyof Actual.Context, ExpectedCoreContracts['Context']>>;
type Contract_ContextSchema = Assert<
	Equal<keyof Actual.ContextSchema, ExpectedCoreContracts['ContextSchema']>
>;
type Contract_Source = Assert<Equal<keyof Actual.Source, ExpectedCoreContracts['Source']>>;
type Contract_GetResult = Assert<
	Equal<keyof Actual.GetResult<Witness.Context>, ExpectedCoreContracts['GetResult']>
>;
type Contract_InferResultType = Assert<
	Equal<keyof Actual.InferResultType<Witness.Context>, ExpectedCoreContracts['InferResultType']>
>;
type Contract_ExtractContext = Assert<
	Equal<
		keyof Actual.ExtractContext<Witness.QueryBuilder<Witness.Context>>,
		ExpectedCoreContracts['ExtractContext']
	>
>;
type Contract_QueryResult = Assert<
	Equal<
		keyof Actual.QueryResult<Witness.QueryBuilder<Witness.Context>>,
		ExpectedCoreContracts['QueryResult']
	>
>;
type Contract_ContextFromSource = Assert<
	Equal<
		keyof Actual.ContextFromSource<{ people: Witness.Collection<Person> }>,
		ExpectedCoreContracts['ContextFromSource']
	>
>;
type Contract_ContextFromUnionBranches = Assert<
	Equal<
		keyof Actual.ContextFromUnionBranches<[Witness.QueryBuilder<Witness.Context>]>,
		ExpectedCoreContracts['ContextFromUnionBranches']
	>
>;
type Contract_ContextFromUnionSource = Assert<
	Equal<
		keyof Actual.ContextFromUnionSource<{ people: Witness.Collection<Person> }>,
		ExpectedCoreContracts['ContextFromUnionSource']
	>
>;
type Contract_SchemaFromSource = Assert<
	Equal<
		keyof Actual.SchemaFromSource<{ people: Witness.Collection<Person> }>,
		ExpectedCoreContracts['SchemaFromSource']
	>
>;
type Contract_SingleSource = Assert<
	Equal<
		keyof Actual.SingleSource<{ people: Witness.Collection<Person> }>,
		ExpectedCoreContracts['SingleSource']
	>
>;
type Contract_InferCollectionType = Assert<
	Equal<
		keyof Actual.InferCollectionType<Witness.Collection<Person>>,
		ExpectedCoreContracts['InferCollectionType']
	>
>;
type Contract_MergeContextWithJoinType = Assert<
	Equal<
		keyof Actual.MergeContextWithJoinType<Witness.Context, { people: Person }, 'left'>,
		ExpectedCoreContracts['MergeContextWithJoinType']
	>
>;
type Contract_MergeContextForJoinCallback = Assert<
	Equal<
		keyof Actual.MergeContextForJoinCallback<Witness.Context, { people: Person }>,
		ExpectedCoreContracts['MergeContextForJoinCallback']
	>
>;
type Contract_ApplyJoinOptionalityToMergedSchema = Assert<
	Equal<
		keyof Actual.ApplyJoinOptionalityToMergedSchema<
			{ people: Person },
			{ people: Person },
			'left',
			'people'
		>,
		ExpectedCoreContracts['ApplyJoinOptionalityToMergedSchema']
	>
>;
type Contract_ResultTypeFromSelect = Assert<
	Equal<
		keyof Actual.ResultTypeFromSelect<{ name: string }>,
		ExpectedCoreContracts['ResultTypeFromSelect']
	>
>;
type Contract_WithResult = Assert<
	Equal<keyof Actual.WithResult<Witness.Context, Person>, ExpectedCoreContracts['WithResult']>
>;
type Contract_JoinOnCallback = Assert<
	Equal<
		Parameters<Actual.JoinOnCallback<Witness.Context>>['length'],
		ExpectedCoreContracts['JoinOnCallback']
	>
>;
type Contract_RefsForContext = Assert<
	Equal<keyof Actual.RefsForContext<Witness.Context>, ExpectedCoreContracts['RefsForContext']>
>;
type Contract_WhereCallback = Assert<
	Equal<
		Parameters<Actual.WhereCallback<Witness.Context>>['length'],
		ExpectedCoreContracts['WhereCallback']
	>
>;
type Contract_OrderByCallback = Assert<
	Equal<
		Parameters<Actual.OrderByCallback<Witness.Context>>['length'],
		ExpectedCoreContracts['OrderByCallback']
	>
>;
type Contract_GroupByCallback = Assert<
	Equal<
		Parameters<Actual.GroupByCallback<Witness.Context>>['length'],
		ExpectedCoreContracts['GroupByCallback']
	>
>;
type Contract_SelectObject = Assert<
	Equal<keyof Actual.SelectObject, ExpectedCoreContracts['SelectObject']>
>;
type Contract_FunctionalHavingRow = Assert<
	Equal<
		keyof Actual.FunctionalHavingRow<Witness.Context>,
		ExpectedCoreContracts['FunctionalHavingRow']
	>
>;
type Contract_Prettify = Assert<
	Equal<keyof Actual.Prettify<Person>, ExpectedCoreContracts['Prettify']>
>;
type Contract_eq = Assert<
	Equal<Parameters<typeof Actual.eq>['length'], ExpectedCoreContracts['eq']>
>;
type Contract_gt = Assert<
	Equal<Parameters<typeof Actual.gt>['length'], ExpectedCoreContracts['gt']>
>;
type Contract_gte = Assert<
	Equal<Parameters<typeof Actual.gte>['length'], ExpectedCoreContracts['gte']>
>;
type Contract_lt = Assert<
	Equal<Parameters<typeof Actual.lt>['length'], ExpectedCoreContracts['lt']>
>;
type Contract_lte = Assert<
	Equal<Parameters<typeof Actual.lte>['length'], ExpectedCoreContracts['lte']>
>;
type Contract_and = Assert<
	Equal<Parameters<typeof Actual.and>['length'], ExpectedCoreContracts['and']>
>;
type Contract_or = Assert<
	Equal<Parameters<typeof Actual.or>['length'], ExpectedCoreContracts['or']>
>;
type Contract_not = Assert<
	Equal<Parameters<typeof Actual.not>['length'], ExpectedCoreContracts['not']>
>;
type Contract_inArray = Assert<
	Equal<Parameters<typeof Actual.inArray>['length'], ExpectedCoreContracts['inArray']>
>;
type Contract_like = Assert<
	Equal<Parameters<typeof Actual.like>['length'], ExpectedCoreContracts['like']>
>;
type Contract_ilike = Assert<
	Equal<Parameters<typeof Actual.ilike>['length'], ExpectedCoreContracts['ilike']>
>;
type Contract_isUndefined = Assert<
	Equal<Parameters<typeof Actual.isUndefined>['length'], ExpectedCoreContracts['isUndefined']>
>;
type Contract_isNull = Assert<
	Equal<Parameters<typeof Actual.isNull>['length'], ExpectedCoreContracts['isNull']>
>;
type Contract_upper = Assert<
	Equal<Parameters<typeof Actual.upper>['length'], ExpectedCoreContracts['upper']>
>;
type Contract_lower = Assert<
	Equal<Parameters<typeof Actual.lower>['length'], ExpectedCoreContracts['lower']>
>;
type Contract_length = Assert<
	Equal<Parameters<typeof Actual.length>['length'], ExpectedCoreContracts['length']>
>;
type Contract_concat = Assert<
	Equal<Parameters<typeof Actual.concat>['length'], ExpectedCoreContracts['concat']>
>;
type Contract_coalesce = Assert<
	Equal<Parameters<typeof Actual.coalesce>['length'], ExpectedCoreContracts['coalesce']>
>;
type Contract_caseWhen = Assert<
	Equal<Parameters<typeof Actual.caseWhen>['length'], ExpectedCoreContracts['caseWhen']>
>;
type Contract_add = Assert<
	Equal<Parameters<typeof Actual.add>['length'], ExpectedCoreContracts['add']>
>;
type Contract_subtract = Assert<
	Equal<Parameters<typeof Actual.subtract>['length'], ExpectedCoreContracts['subtract']>
>;
type Contract_multiply = Assert<
	Equal<Parameters<typeof Actual.multiply>['length'], ExpectedCoreContracts['multiply']>
>;
type Contract_divide = Assert<
	Equal<Parameters<typeof Actual.divide>['length'], ExpectedCoreContracts['divide']>
>;
type Contract_count = Assert<
	Equal<Parameters<typeof Actual.count>['length'], ExpectedCoreContracts['count']>
>;
type Contract_avg = Assert<
	Equal<Parameters<typeof Actual.avg>['length'], ExpectedCoreContracts['avg']>
>;
type Contract_sum = Assert<
	Equal<Parameters<typeof Actual.sum>['length'], ExpectedCoreContracts['sum']>
>;
type Contract_min = Assert<
	Equal<Parameters<typeof Actual.min>['length'], ExpectedCoreContracts['min']>
>;
type Contract_max = Assert<
	Equal<Parameters<typeof Actual.max>['length'], ExpectedCoreContracts['max']>
>;
type Contract_toArray = Assert<
	Equal<Parameters<typeof Actual.toArray>['length'], ExpectedCoreContracts['toArray']>
>;
type Contract_materialize = Assert<
	Equal<Parameters<typeof Actual.materialize>['length'], ExpectedCoreContracts['materialize']>
>;
type Contract_Ref = Assert<Equal<keyof Actual.Ref, ExpectedCoreContracts['Ref']>>;
type Contract_compileQuery = Assert<
	Equal<Parameters<typeof Actual.compileQuery>['length'], ExpectedCoreContracts['compileQuery']>
>;
type Contract_compileExpression = Assert<
	Equal<
		Parameters<typeof Actual.compileExpression>['length'],
		ExpectedCoreContracts['compileExpression']
	>
>;
type Contract_compileSingleRowExpression = Assert<
	Equal<
		Parameters<typeof Actual.compileSingleRowExpression>['length'],
		ExpectedCoreContracts['compileSingleRowExpression']
	>
>;
type Contract_toBooleanPredicate = Assert<
	Equal<
		Parameters<typeof Actual.toBooleanPredicate>['length'],
		ExpectedCoreContracts['toBooleanPredicate']
	>
>;
type Contract_createLiveQueryCollection = Assert<
	Equal<
		Parameters<typeof Actual.createLiveQueryCollection>['length'],
		ExpectedCoreContracts['createLiveQueryCollection']
	>
>;
type Contract_liveQueryCollectionOptions = Assert<
	Equal<
		Parameters<typeof Actual.liveQueryCollectionOptions>['length'],
		ExpectedCoreContracts['liveQueryCollectionOptions']
	>
>;
type Contract_queryOnce = Assert<
	Equal<Parameters<typeof Actual.queryOnce>['length'], ExpectedCoreContracts['queryOnce']>
>;
type Contract_QueryOnceConfig = Assert<
	Equal<keyof Actual.QueryOnceConfig<Witness.Context>, ExpectedCoreContracts['QueryOnceConfig']>
>;
type Contract_LiveQueryCollectionConfig = Assert<
	Equal<
		keyof Actual.LiveQueryCollectionConfig<Witness.Context>,
		ExpectedCoreContracts['LiveQueryCollectionConfig']
	>
>;
type Contract_LiveQueryCollectionUtils = Assert<
	Equal<keyof Actual.LiveQueryCollectionUtils, ExpectedCoreContracts['LiveQueryCollectionUtils']>
>;
type Contract_UnhashableQueryIRError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnhashableQueryIRError>,
		ExpectedCoreContracts['UnhashableQueryIRError']
	>
>;
type Contract_canonicalizeQueryIR = Assert<
	Equal<
		Parameters<typeof Actual.canonicalizeQueryIR>['length'],
		ExpectedCoreContracts['canonicalizeQueryIR']
	>
>;
type Contract_getLoadSubsetDemandKey = Assert<
	Equal<
		Parameters<typeof Actual.getLoadSubsetDemandKey>['length'],
		ExpectedCoreContracts['getLoadSubsetDemandKey']
	>
>;
type Contract_getQueryIdentity = Assert<
	Equal<
		Parameters<typeof Actual.getQueryIdentity>['length'],
		ExpectedCoreContracts['getQueryIdentity']
	>
>;
type Contract_getStableQueryBuilderHash = Assert<
	Equal<
		Parameters<typeof Actual.getStableQueryBuilderHash>['length'],
		ExpectedCoreContracts['getStableQueryBuilderHash']
	>
>;
type Contract_getStableQueryIRHash = Assert<
	Equal<
		Parameters<typeof Actual.getStableQueryIRHash>['length'],
		ExpectedCoreContracts['getStableQueryIRHash']
	>
>;
type Contract_getStableValueHash = Assert<
	Equal<
		Parameters<typeof Actual.getStableValueHash>['length'],
		ExpectedCoreContracts['getStableValueHash']
	>
>;
type Contract_DemandKey = Assert<
	Equal<Actual.DemandKey['length'], ExpectedCoreContracts['DemandKey']>
>;
type Contract_QueryIdentity = Assert<
	Equal<Actual.QueryIdentity['length'], ExpectedCoreContracts['QueryIdentity']>
>;
type Contract_DeduplicatedLoadSubset = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DeduplicatedLoadSubset>,
		ExpectedCoreContracts['DeduplicatedLoadSubset']
	>
>;
type Contract_createOptimisticAction = Assert<
	Equal<
		Parameters<typeof Actual.createOptimisticAction>['length'],
		ExpectedCoreContracts['createOptimisticAction']
	>
>;
type Contract_isCollection = Assert<
	Equal<Parameters<typeof Actual.isCollection>['length'], ExpectedCoreContracts['isCollection']>
>;
type Contract_isSingleResultCollection = Assert<
	Equal<
		Parameters<typeof Actual.isSingleResultCollection>['length'],
		ExpectedCoreContracts['isSingleResultCollection']
	>
>;
type Contract_getLiveQueryStatusFlags = Assert<
	Equal<
		Parameters<typeof Actual.getLiveQueryStatusFlags>['length'],
		ExpectedCoreContracts['getLiveQueryStatusFlags']
	>
>;
type Contract_LiveQueryStatusFlags = Assert<
	Equal<keyof Actual.LiveQueryStatusFlags, ExpectedCoreContracts['LiveQueryStatusFlags']>
>;
type Contract_createLiveQueryObserver = Assert<
	Equal<
		Parameters<typeof Actual.createLiveQueryObserver>['length'],
		ExpectedCoreContracts['createLiveQueryObserver']
	>
>;
type Contract_LiveQuerySnapshot = Assert<
	Equal<keyof Actual.LiveQuerySnapshot<Person, string>, ExpectedCoreContracts['LiveQuerySnapshot']>
>;
type Contract_LiveQueryObserverListener = Assert<
	Equal<
		Parameters<Actual.LiveQueryObserverListener<Person, string>>['length'],
		ExpectedCoreContracts['LiveQueryObserverListener']
	>
>;
type Contract_LiveQueryObserver = Assert<
	Equal<keyof Actual.LiveQueryObserver<Person, string>, ExpectedCoreContracts['LiveQueryObserver']>
>;
type Contract_CreateLiveQueryObserverOptions = Assert<
	Equal<
		keyof Actual.CreateLiveQueryObserverOptions,
		ExpectedCoreContracts['CreateLiveQueryObserverOptions']
	>
>;
type Contract_prepareLiveQueryValue = Assert<
	Equal<
		Parameters<typeof Actual.prepareLiveQueryValue>['length'],
		ExpectedCoreContracts['prepareLiveQueryValue']
	>
>;
type Contract_getPreparedLiveQueryIdentity = Assert<
	Equal<
		Parameters<typeof Actual.getPreparedLiveQueryIdentity>['length'],
		ExpectedCoreContracts['getPreparedLiveQueryIdentity']
	>
>;
type Contract_getLiveQueryHash = Assert<
	Equal<
		Parameters<typeof Actual.getLiveQueryHash>['length'],
		ExpectedCoreContracts['getLiveQueryHash']
	>
>;
type Contract_LiveQueryOptions = Assert<
	Equal<keyof Actual.LiveQueryOptions, ExpectedCoreContracts['LiveQueryOptions']>
>;
type Contract_DeferredLiveQueryCollections = Assert<
	Equal<
		keyof Actual.DeferredLiveQueryCollections,
		ExpectedCoreContracts['DeferredLiveQueryCollections']
	>
>;
type Contract_getLiveQueryWindowInputKind = Assert<
	Equal<
		Parameters<typeof Actual.getLiveQueryWindowInputKind>['length'],
		ExpectedCoreContracts['getLiveQueryWindowInputKind']
	>
>;
type Contract_resolveLiveQueryWindowInput = Assert<
	Equal<
		Parameters<typeof Actual.resolveLiveQueryWindowInput>['length'],
		ExpectedCoreContracts['resolveLiveQueryWindowInput']
	>
>;
type Contract_normalizeLiveQueryWindowPageSize = Assert<
	Equal<
		Parameters<typeof Actual.normalizeLiveQueryWindowPageSize>['length'],
		ExpectedCoreContracts['normalizeLiveQueryWindowPageSize']
	>
>;
type Contract_hasLiveQueryWindowLeases = Assert<
	Equal<
		Parameters<typeof Actual.hasLiveQueryWindowLeases>['length'],
		ExpectedCoreContracts['hasLiveQueryWindowLeases']
	>
>;
type Contract_assertLiveQueryWindowManyResult = Assert<
	Equal<
		Parameters<typeof Actual.assertLiveQueryWindowManyResult>['length'],
		ExpectedCoreContracts['assertLiveQueryWindowManyResult']
	>
>;
type Contract_isLiveQueryWindowCollection = Assert<
	Equal<
		Parameters<typeof Actual.isLiveQueryWindowCollection>['length'],
		ExpectedCoreContracts['isLiveQueryWindowCollection']
	>
>;
type Contract_getLiveQueryWindowCollectionWarning = Assert<
	Equal<
		Parameters<typeof Actual.getLiveQueryWindowCollectionWarning>['length'],
		ExpectedCoreContracts['getLiveQueryWindowCollectionWarning']
	>
>;
type Contract_compareLiveQueryWindowDependencies = Assert<
	Equal<
		Parameters<typeof Actual.compareLiveQueryWindowDependencies>['length'],
		ExpectedCoreContracts['compareLiveQueryWindowDependencies']
	>
>;
type Contract_shouldPreserveLiveQueryWindowPageCount = Assert<
	Equal<
		Parameters<typeof Actual.shouldPreserveLiveQueryWindowPageCount>['length'],
		ExpectedCoreContracts['shouldPreserveLiveQueryWindowPageCount']
	>
>;
type Contract_fetchNextLiveQueryWindowPage = Assert<
	Equal<
		Parameters<typeof Actual.fetchNextLiveQueryWindowPage>['length'],
		ExpectedCoreContracts['fetchNextLiveQueryWindowPage']
	>
>;
type Contract_createLiveQueryWindowController = Assert<
	Equal<
		Parameters<typeof Actual.createLiveQueryWindowController>['length'],
		ExpectedCoreContracts['createLiveQueryWindowController']
	>
>;
type Contract_LiveQueryWindowInputKind = Assert<
	Equal<Actual.LiveQueryWindowInputKind, ExpectedCoreContracts['LiveQueryWindowInputKind']>
>;
type Contract_ResolvedLiveQueryWindowInput = Assert<
	Equal<
		keyof Actual.ResolvedLiveQueryWindowInput<Witness.Context>,
		ExpectedCoreContracts['ResolvedLiveQueryWindowInput']
	>
>;
type Contract_LiveQueryWindowCollection = Assert<
	Equal<keyof Actual.LiveQueryWindowCollection, ExpectedCoreContracts['LiveQueryWindowCollection']>
>;
type Contract_LiveQueryWindowSnapshot = Assert<
	Equal<
		keyof Actual.LiveQueryWindowSnapshot<Person, string>,
		ExpectedCoreContracts['LiveQueryWindowSnapshot']
	>
>;
type Contract_CreateLiveQueryWindowControllerOptions = Assert<
	Equal<
		keyof Actual.CreateLiveQueryWindowControllerOptions,
		ExpectedCoreContracts['CreateLiveQueryWindowControllerOptions']
	>
>;
type Contract_LiveQueryWindowController = Assert<
	Equal<
		keyof Actual.LiveQueryWindowController<Person, string>,
		ExpectedCoreContracts['LiveQueryWindowController']
	>
>;
type Contract_localOnlyCollectionOptions = Assert<
	Equal<
		Parameters<typeof Actual.localOnlyCollectionOptions>['length'],
		ExpectedCoreContracts['localOnlyCollectionOptions']
	>
>;
type Contract_LocalOnlyCollectionConfig = Assert<
	Equal<keyof Actual.LocalOnlyCollectionConfig, ExpectedCoreContracts['LocalOnlyCollectionConfig']>
>;
type Contract_LocalOnlyCollectionUtils = Assert<
	Equal<keyof Actual.LocalOnlyCollectionUtils, ExpectedCoreContracts['LocalOnlyCollectionUtils']>
>;
type Contract_localStorageCollectionOptions = Assert<
	Equal<
		Parameters<typeof Actual.localStorageCollectionOptions>['length'],
		ExpectedCoreContracts['localStorageCollectionOptions']
	>
>;
type Contract_StorageApi = Assert<
	Equal<keyof Actual.StorageApi, ExpectedCoreContracts['StorageApi']>
>;
type Contract_StorageEventApi = Assert<
	Equal<keyof Actual.StorageEventApi, ExpectedCoreContracts['StorageEventApi']>
>;
type Contract_Parser = Assert<Equal<keyof Actual.Parser, ExpectedCoreContracts['Parser']>>;
type Contract_LocalStorageCollectionConfig = Assert<
	Equal<
		keyof Actual.LocalStorageCollectionConfig,
		ExpectedCoreContracts['LocalStorageCollectionConfig']
	>
>;
type Contract_ClearStorageFn = Assert<
	Equal<Parameters<Actual.ClearStorageFn>['length'], ExpectedCoreContracts['ClearStorageFn']>
>;
type Contract_GetStorageSizeFn = Assert<
	Equal<Parameters<Actual.GetStorageSizeFn>['length'], ExpectedCoreContracts['GetStorageSizeFn']>
>;
type Contract_LocalStorageCollectionUtils = Assert<
	Equal<
		keyof Actual.LocalStorageCollectionUtils,
		ExpectedCoreContracts['LocalStorageCollectionUtils']
	>
>;
type Contract_TanStackDBError = Assert<
	Equal<keyof InstanceType<typeof Actual.TanStackDBError>, ExpectedCoreContracts['TanStackDBError']>
>;
type Contract_NonRetriableError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NonRetriableError>,
		ExpectedCoreContracts['NonRetriableError']
	>
>;
type Contract_SchemaValidationError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SchemaValidationError>,
		ExpectedCoreContracts['SchemaValidationError']
	>
>;
type Contract_DuplicateDbInstanceError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DuplicateDbInstanceError>,
		ExpectedCoreContracts['DuplicateDbInstanceError']
	>
>;
type Contract_CollectionConfigurationError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionConfigurationError>,
		ExpectedCoreContracts['CollectionConfigurationError']
	>
>;
type Contract_CollectionRequiresConfigError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionRequiresConfigError>,
		ExpectedCoreContracts['CollectionRequiresConfigError']
	>
>;
type Contract_CollectionRequiresSyncConfigError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionRequiresSyncConfigError>,
		ExpectedCoreContracts['CollectionRequiresSyncConfigError']
	>
>;
type Contract_InvalidSchemaError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidSchemaError>,
		ExpectedCoreContracts['InvalidSchemaError']
	>
>;
type Contract_SchemaMustBeSynchronousError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SchemaMustBeSynchronousError>,
		ExpectedCoreContracts['SchemaMustBeSynchronousError']
	>
>;
type Contract_CollectionStateError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionStateError>,
		ExpectedCoreContracts['CollectionStateError']
	>
>;
type Contract_CollectionInErrorStateError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionInErrorStateError>,
		ExpectedCoreContracts['CollectionInErrorStateError']
	>
>;
type Contract_InvalidCollectionStatusTransitionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidCollectionStatusTransitionError>,
		ExpectedCoreContracts['InvalidCollectionStatusTransitionError']
	>
>;
type Contract_CollectionIsInErrorStateError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionIsInErrorStateError>,
		ExpectedCoreContracts['CollectionIsInErrorStateError']
	>
>;
type Contract_NegativeActiveSubscribersError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NegativeActiveSubscribersError>,
		ExpectedCoreContracts['NegativeActiveSubscribersError']
	>
>;
type Contract_LiveQueryObserverDisposedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.LiveQueryObserverDisposedError>,
		ExpectedCoreContracts['LiveQueryObserverDisposedError']
	>
>;
type Contract_LiveQueryWindowControllerDisposedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.LiveQueryWindowControllerDisposedError>,
		ExpectedCoreContracts['LiveQueryWindowControllerDisposedError']
	>
>;
type Contract_CollectionOperationError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionOperationError>,
		ExpectedCoreContracts['CollectionOperationError']
	>
>;
type Contract_UndefinedKeyError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UndefinedKeyError>,
		ExpectedCoreContracts['UndefinedKeyError']
	>
>;
type Contract_InvalidKeyError = Assert<
	Equal<keyof InstanceType<typeof Actual.InvalidKeyError>, ExpectedCoreContracts['InvalidKeyError']>
>;
type Contract_DuplicateKeyError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DuplicateKeyError>,
		ExpectedCoreContracts['DuplicateKeyError']
	>
>;
type Contract_DuplicateKeySyncError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DuplicateKeySyncError>,
		ExpectedCoreContracts['DuplicateKeySyncError']
	>
>;
type Contract_MissingUpdateArgumentError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingUpdateArgumentError>,
		ExpectedCoreContracts['MissingUpdateArgumentError']
	>
>;
type Contract_NoKeysPassedToUpdateError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NoKeysPassedToUpdateError>,
		ExpectedCoreContracts['NoKeysPassedToUpdateError']
	>
>;
type Contract_UpdateKeyNotFoundError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UpdateKeyNotFoundError>,
		ExpectedCoreContracts['UpdateKeyNotFoundError']
	>
>;
type Contract_KeyUpdateNotAllowedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.KeyUpdateNotAllowedError>,
		ExpectedCoreContracts['KeyUpdateNotAllowedError']
	>
>;
type Contract_NoKeysPassedToDeleteError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NoKeysPassedToDeleteError>,
		ExpectedCoreContracts['NoKeysPassedToDeleteError']
	>
>;
type Contract_DeleteKeyNotFoundError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DeleteKeyNotFoundError>,
		ExpectedCoreContracts['DeleteKeyNotFoundError']
	>
>;
type Contract_MissingHandlerError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingHandlerError>,
		ExpectedCoreContracts['MissingHandlerError']
	>
>;
type Contract_MissingInsertHandlerError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingInsertHandlerError>,
		ExpectedCoreContracts['MissingInsertHandlerError']
	>
>;
type Contract_MissingUpdateHandlerError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingUpdateHandlerError>,
		ExpectedCoreContracts['MissingUpdateHandlerError']
	>
>;
type Contract_MissingDeleteHandlerError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingDeleteHandlerError>,
		ExpectedCoreContracts['MissingDeleteHandlerError']
	>
>;
type Contract_TransactionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.TransactionError>,
		ExpectedCoreContracts['TransactionError']
	>
>;
type Contract_MissingMutationFunctionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingMutationFunctionError>,
		ExpectedCoreContracts['MissingMutationFunctionError']
	>
>;
type Contract_OnMutateMustBeSynchronousError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.OnMutateMustBeSynchronousError>,
		ExpectedCoreContracts['OnMutateMustBeSynchronousError']
	>
>;
type Contract_TransactionNotPendingMutateError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.TransactionNotPendingMutateError>,
		ExpectedCoreContracts['TransactionNotPendingMutateError']
	>
>;
type Contract_TransactionAlreadyCompletedRollbackError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.TransactionAlreadyCompletedRollbackError>,
		ExpectedCoreContracts['TransactionAlreadyCompletedRollbackError']
	>
>;
type Contract_TransactionNotPendingCommitError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.TransactionNotPendingCommitError>,
		ExpectedCoreContracts['TransactionNotPendingCommitError']
	>
>;
type Contract_NoPendingSyncTransactionWriteError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NoPendingSyncTransactionWriteError>,
		ExpectedCoreContracts['NoPendingSyncTransactionWriteError']
	>
>;
type Contract_SyncTransactionAlreadyCommittedWriteError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SyncTransactionAlreadyCommittedWriteError>,
		ExpectedCoreContracts['SyncTransactionAlreadyCommittedWriteError']
	>
>;
type Contract_NoPendingSyncTransactionCommitError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NoPendingSyncTransactionCommitError>,
		ExpectedCoreContracts['NoPendingSyncTransactionCommitError']
	>
>;
type Contract_SyncTransactionAlreadyCommittedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SyncTransactionAlreadyCommittedError>,
		ExpectedCoreContracts['SyncTransactionAlreadyCommittedError']
	>
>;
type Contract_QueryBuilderError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.QueryBuilderError>,
		ExpectedCoreContracts['QueryBuilderError']
	>
>;
type Contract_OnlyOneSourceAllowedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.OnlyOneSourceAllowedError>,
		ExpectedCoreContracts['OnlyOneSourceAllowedError']
	>
>;
type Contract_SubQueryMustHaveFromClauseError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SubQueryMustHaveFromClauseError>,
		ExpectedCoreContracts['SubQueryMustHaveFromClauseError']
	>
>;
type Contract_InvalidSourceError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidSourceError>,
		ExpectedCoreContracts['InvalidSourceError']
	>
>;
type Contract_SourceClauseContext = Assert<
	Equal<Actual.SourceClauseContext, ExpectedCoreContracts['SourceClauseContext']>
>;
type Contract_InvalidSourceTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidSourceTypeError>,
		ExpectedCoreContracts['InvalidSourceTypeError']
	>
>;
type Contract_JoinConditionMustBeEqualityError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.JoinConditionMustBeEqualityError>,
		ExpectedCoreContracts['JoinConditionMustBeEqualityError']
	>
>;
type Contract_QueryMustHaveFromClauseError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.QueryMustHaveFromClauseError>,
		ExpectedCoreContracts['QueryMustHaveFromClauseError']
	>
>;
type Contract_InvalidWhereExpressionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidWhereExpressionError>,
		ExpectedCoreContracts['InvalidWhereExpressionError']
	>
>;
type Contract_QueryCompilationError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.QueryCompilationError>,
		ExpectedCoreContracts['QueryCompilationError']
	>
>;
type Contract_UnsafeAliasPathError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsafeAliasPathError>,
		ExpectedCoreContracts['UnsafeAliasPathError']
	>
>;
type Contract_DistinctRequiresSelectError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DistinctRequiresSelectError>,
		ExpectedCoreContracts['DistinctRequiresSelectError']
	>
>;
type Contract_FnSelectWithGroupByError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.FnSelectWithGroupByError>,
		ExpectedCoreContracts['FnSelectWithGroupByError']
	>
>;
type Contract_UnsupportedFnSelectResultError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedFnSelectResultError>,
		ExpectedCoreContracts['UnsupportedFnSelectResultError']
	>
>;
type Contract_UnsupportedRootScalarSelectError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedRootScalarSelectError>,
		ExpectedCoreContracts['UnsupportedRootScalarSelectError']
	>
>;
type Contract_HavingRequiresGroupByError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.HavingRequiresGroupByError>,
		ExpectedCoreContracts['HavingRequiresGroupByError']
	>
>;
type Contract_LimitOffsetRequireOrderByError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.LimitOffsetRequireOrderByError>,
		ExpectedCoreContracts['LimitOffsetRequireOrderByError']
	>
>;
type Contract_CollectionInputNotFoundError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionInputNotFoundError>,
		ExpectedCoreContracts['CollectionInputNotFoundError']
	>
>;
type Contract_DuplicateAliasInSubqueryError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.DuplicateAliasInSubqueryError>,
		ExpectedCoreContracts['DuplicateAliasInSubqueryError']
	>
>;
type Contract_UnsupportedFromTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedFromTypeError>,
		ExpectedCoreContracts['UnsupportedFromTypeError']
	>
>;
type Contract_UnknownExpressionTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnknownExpressionTypeError>,
		ExpectedCoreContracts['UnknownExpressionTypeError']
	>
>;
type Contract_EmptyReferencePathError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.EmptyReferencePathError>,
		ExpectedCoreContracts['EmptyReferencePathError']
	>
>;
type Contract_UnknownFunctionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnknownFunctionError>,
		ExpectedCoreContracts['UnknownFunctionError']
	>
>;
type Contract_JoinCollectionNotFoundError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.JoinCollectionNotFoundError>,
		ExpectedCoreContracts['JoinCollectionNotFoundError']
	>
>;
type Contract_JoinError = Assert<
	Equal<keyof InstanceType<typeof Actual.JoinError>, ExpectedCoreContracts['JoinError']>
>;
type Contract_UnsupportedJoinTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedJoinTypeError>,
		ExpectedCoreContracts['UnsupportedJoinTypeError']
	>
>;
type Contract_InvalidJoinConditionSameSourceError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidJoinConditionSameSourceError>,
		ExpectedCoreContracts['InvalidJoinConditionSameSourceError']
	>
>;
type Contract_InvalidJoinConditionSourceMismatchError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidJoinConditionSourceMismatchError>,
		ExpectedCoreContracts['InvalidJoinConditionSourceMismatchError']
	>
>;
type Contract_InvalidJoinConditionLeftSourceError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidJoinConditionLeftSourceError>,
		ExpectedCoreContracts['InvalidJoinConditionLeftSourceError']
	>
>;
type Contract_InvalidJoinConditionRightSourceError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidJoinConditionRightSourceError>,
		ExpectedCoreContracts['InvalidJoinConditionRightSourceError']
	>
>;
type Contract_InvalidJoinCondition = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidJoinCondition>,
		ExpectedCoreContracts['InvalidJoinCondition']
	>
>;
type Contract_UnsupportedJoinSourceTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedJoinSourceTypeError>,
		ExpectedCoreContracts['UnsupportedJoinSourceTypeError']
	>
>;
type Contract_GroupByError = Assert<
	Equal<keyof InstanceType<typeof Actual.GroupByError>, ExpectedCoreContracts['GroupByError']>
>;
type Contract_NonAggregateExpressionNotInGroupByError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.NonAggregateExpressionNotInGroupByError>,
		ExpectedCoreContracts['NonAggregateExpressionNotInGroupByError']
	>
>;
type Contract_UnsupportedAggregateFunctionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnsupportedAggregateFunctionError>,
		ExpectedCoreContracts['UnsupportedAggregateFunctionError']
	>
>;
type Contract_AggregateFunctionNotInSelectError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.AggregateFunctionNotInSelectError>,
		ExpectedCoreContracts['AggregateFunctionNotInSelectError']
	>
>;
type Contract_UnknownHavingExpressionTypeError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.UnknownHavingExpressionTypeError>,
		ExpectedCoreContracts['UnknownHavingExpressionTypeError']
	>
>;
type Contract_StorageError = Assert<
	Equal<keyof InstanceType<typeof Actual.StorageError>, ExpectedCoreContracts['StorageError']>
>;
type Contract_SerializationError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SerializationError>,
		ExpectedCoreContracts['SerializationError']
	>
>;
type Contract_LocalStorageCollectionError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.LocalStorageCollectionError>,
		ExpectedCoreContracts['LocalStorageCollectionError']
	>
>;
type Contract_StorageKeyRequiredError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.StorageKeyRequiredError>,
		ExpectedCoreContracts['StorageKeyRequiredError']
	>
>;
type Contract_InvalidStorageDataFormatError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidStorageDataFormatError>,
		ExpectedCoreContracts['InvalidStorageDataFormatError']
	>
>;
type Contract_InvalidStorageObjectFormatError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.InvalidStorageObjectFormatError>,
		ExpectedCoreContracts['InvalidStorageObjectFormatError']
	>
>;
type Contract_SyncCleanupError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SyncCleanupError>,
		ExpectedCoreContracts['SyncCleanupError']
	>
>;
type Contract_SyncTransactionAbortedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SyncTransactionAbortedError>,
		ExpectedCoreContracts['SyncTransactionAbortedError']
	>
>;
type Contract_CollectionPreloadAbortedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CollectionPreloadAbortedError>,
		ExpectedCoreContracts['CollectionPreloadAbortedError']
	>
>;
type Contract_LoadSubsetOperationAbortedError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.LoadSubsetOperationAbortedError>,
		ExpectedCoreContracts['LoadSubsetOperationAbortedError']
	>
>;
type Contract_QueryOptimizerError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.QueryOptimizerError>,
		ExpectedCoreContracts['QueryOptimizerError']
	>
>;
type Contract_CannotCombineEmptyExpressionListError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.CannotCombineEmptyExpressionListError>,
		ExpectedCoreContracts['CannotCombineEmptyExpressionListError']
	>
>;
type Contract_MissingAliasInputsError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.MissingAliasInputsError>,
		ExpectedCoreContracts['MissingAliasInputsError']
	>
>;
type Contract_SetWindowRequiresOrderByError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SetWindowRequiresOrderByError>,
		ExpectedCoreContracts['SetWindowRequiresOrderByError']
	>
>;
type Contract_SetWindowReentrancyError = Assert<
	Equal<
		keyof InstanceType<typeof Actual.SetWindowReentrancyError>,
		ExpectedCoreContracts['SetWindowReentrancyError']
	>
>;
type Contract_createPacedMutations = Assert<
	Equal<
		Parameters<typeof Actual.createPacedMutations>['length'],
		ExpectedCoreContracts['createPacedMutations']
	>
>;
type Contract_PacedMutationsConfig = Assert<
	Equal<keyof Actual.PacedMutationsConfig, ExpectedCoreContracts['PacedMutationsConfig']>
>;
type Contract_debounceStrategy = Assert<
	Equal<
		Parameters<typeof Actual.debounceStrategy>['length'],
		ExpectedCoreContracts['debounceStrategy']
	>
>;
type Contract_queueStrategy = Assert<
	Equal<Parameters<typeof Actual.queueStrategy>['length'], ExpectedCoreContracts['queueStrategy']>
>;
type Contract_throttleStrategy = Assert<
	Equal<
		Parameters<typeof Actual.throttleStrategy>['length'],
		ExpectedCoreContracts['throttleStrategy']
	>
>;
type Contract_Strategy = Assert<Equal<keyof Actual.Strategy, ExpectedCoreContracts['Strategy']>>;
type Contract_BaseStrategy = Assert<
	Equal<keyof Actual.BaseStrategy, ExpectedCoreContracts['BaseStrategy']>
>;
type Contract_DebounceStrategy = Assert<
	Equal<keyof Actual.DebounceStrategy, ExpectedCoreContracts['DebounceStrategy']>
>;
type Contract_DebounceStrategyOptions = Assert<
	Equal<keyof Actual.DebounceStrategyOptions, ExpectedCoreContracts['DebounceStrategyOptions']>
>;
type Contract_QueueStrategy = Assert<
	Equal<keyof Actual.QueueStrategy, ExpectedCoreContracts['QueueStrategy']>
>;
type Contract_QueueStrategyOptions = Assert<
	Equal<keyof Actual.QueueStrategyOptions, ExpectedCoreContracts['QueueStrategyOptions']>
>;
type Contract_ThrottleStrategy = Assert<
	Equal<keyof Actual.ThrottleStrategy, ExpectedCoreContracts['ThrottleStrategy']>
>;
type Contract_ThrottleStrategyOptions = Assert<
	Equal<keyof Actual.ThrottleStrategyOptions, ExpectedCoreContracts['ThrottleStrategyOptions']>
>;
type Contract_StrategyOptions = Assert<
	Equal<
		keyof Actual.StrategyOptions<Witness.DebounceStrategy>,
		ExpectedCoreContracts['StrategyOptions']
	>
>;
type Contract_extractFieldPath = Assert<
	Equal<
		Parameters<typeof Actual.extractFieldPath>['length'],
		ExpectedCoreContracts['extractFieldPath']
	>
>;
type Contract_extractValue = Assert<
	Equal<Parameters<typeof Actual.extractValue>['length'], ExpectedCoreContracts['extractValue']>
>;
type Contract_walkExpression = Assert<
	Equal<Parameters<typeof Actual.walkExpression>['length'], ExpectedCoreContracts['walkExpression']>
>;
type Contract_parseWhereExpression = Assert<
	Equal<
		Parameters<typeof Actual.parseWhereExpression>['length'],
		ExpectedCoreContracts['parseWhereExpression']
	>
>;
type Contract_parseOrderByExpression = Assert<
	Equal<
		Parameters<typeof Actual.parseOrderByExpression>['length'],
		ExpectedCoreContracts['parseOrderByExpression']
	>
>;
type Contract_extractSimpleComparisons = Assert<
	Equal<
		Parameters<typeof Actual.extractSimpleComparisons>['length'],
		ExpectedCoreContracts['extractSimpleComparisons']
	>
>;
type Contract_parseLoadSubsetOptions = Assert<
	Equal<
		Parameters<typeof Actual.parseLoadSubsetOptions>['length'],
		ExpectedCoreContracts['parseLoadSubsetOptions']
	>
>;
type Contract_FieldPath = Assert<Equal<keyof Actual.FieldPath, ExpectedCoreContracts['FieldPath']>>;
type Contract_SimpleComparison = Assert<
	Equal<keyof Actual.SimpleComparison, ExpectedCoreContracts['SimpleComparison']>
>;
type Contract_ParseWhereOptions = Assert<
	Equal<keyof Actual.ParseWhereOptions, ExpectedCoreContracts['ParseWhereOptions']>
>;
type Contract_ParsedOrderBy = Assert<
	Equal<keyof Actual.ParsedOrderBy, ExpectedCoreContracts['ParsedOrderBy']>
>;
// Opaque query and demand identities must not accept arbitrary un-hashed text.
// @ts-expect-error A demand key must come from the core identity API.
const invalidDemand: Actual.DemandKey = 'unhashed';
// @ts-expect-error A query identity must come from the core identity API.
const invalidIdentity: Actual.QueryIdentity = 'unhashed';
