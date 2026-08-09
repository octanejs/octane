<script setup vapor>
import TreeNode from './TreeNode.vue';
import { D } from './state.js';
</script>

<template>
	<div class="page" data-page="b">
		<TreeNode :depth="D" path="b" />
	</div>
</template>
