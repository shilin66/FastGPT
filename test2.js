const text = '<summary>\n' +
    'MongoDB 对象成员可以添加空对象，但不能添加空值。更新操作不会立刻 fsync 到磁盘，而是默认延迟执行。MongoDB 通过预分配预留空间来防止文件系统碎片，导致数据文件较大。在 MongoDB 的备份集群中，主节点负责所有写入操作，而从节点通过复制 oplog 来跟踪主节点的操作。当主节点发生故障时，集群会在 10 到 30 秒内选出新的Mb 时，MongoDB 会将数据迁移到多个分片。更新正在迁移的文档时，更改会先在旧分片上发生，然后复制到新分片。\n' +
    '</summary>\n' +
    '\n' +
    '<questionIndex>\n' +
    '1. MongoDB 是否允许添加空值到数据库集合？\n' +
    '2. 用户可以向 MongoDB 添加什么类型的空对象？\n' +
    '3. 更新操作是否立刻同步到磁盘？\n' +
    '4. 默认情况下，MongoDB 的写操作多久同步到磁盘？\n' +
    '5. 为什么 MongoDB 的数据文件会变得非常大？\n' +
    '6. MongoDB 如何防止文件系统碎片？\n' +
    '7. 在 MongoDB 的备份集群中，主节点的职责是什么？\n' +
    '8. 当主节点发生故障时，备份集群需要多长时间选出新的主节点？\n' +
    '9. 在主节点故障期间，哪些操作会失败？\n' +
    '10. 在主节点故障期间，是否可以在从节点上执行查询？\n' +
    '11. 从节点如何跟踪主节点的操作？\n' +
    '12. 调用 getLastError 的目的是什么？\n' +
    '13. 是否必须调用 getLastError 来确保写操作生效？\n' +
    '14. 开始 MongoDB 环境时，是否应该考虑集群分片？\n' +
    '15. 从非集群分片升级到集群分片是否复杂？\n' +
    '16. 分片和复制在 MongoDB 中是如何工作的？\n' +
    '17. 每个分片可以由什么组成？\n' +
    '18. MongoDB 的分片机制基于什么？\n' +
    '19. 默认情况下，MongoDB 的块大小是多少？\n' +
    '20. 数据在什么情况下会扩展到多个分片？\n' +
    '21. 更新正在迁移的文档时会发生什么？\n' +
    '22. 更新操作如何在迁移过程中同步到新分片？\n' +
    '23. MongoDB 的设计目标是什么？\n' +
    '</questionIndex>\n';

const extractData = (content) => {
    const summaryMatch = content.match(/<summary>\n([\s\S]*?)\n<\/summary>/);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';

    const questionIndexMatch = content.match(/<questionIndex>\n([\s\S]*?)\n<\/questionIndex>/);
    const questionIndex = questionIndexMatch ? questionIndexMatch[1].trim() : '';
    return { summary, questionIndex };
};

const { summary, questionIndex } = extractData(text);
console.log('Summary:', summary);
console.log('Question Index:', questionIndex);
