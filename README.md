 # Motivation

 
"**Представьте, что вы строите дом без чертежей**"

### 🎯 Проблема, которую решает Katch:

1. **Сложность современных приложений**
   - Множество асинхронных операций
   - Сложные потоки данных
   - Трудно отследить, что происходит в системе

2. **Типичные боли разработчиков**
   ```typescript
   // Обычный код
   async function handleUserAction() {
     try {
       await connectToDb();
       await fetchData();
       await processData();
       // А что если что-то пошло не так?
       // Где логировать?
       // Как отследить последовательность?
     } catch (error) {
       // Какие ошибки мы ловим?
     }
   }
   ```

### 💡 Решение с Katch:

```typescript
@Katch
class UserService extends KatchApp {
  static Event_DbConnected = Katch.EventPoint()
  static Event_DataFetched = Katch.EventPoint()

  async handleUserAction() {
    Katch.Event(this.Event_DbConnected)
    // Теперь мы точно знаем, что БД подключена
    
    // Остальная логика...
  }
}
```


### 🚀 Преимущества:

1. **Прозрачность**
   - Видно все зависимости
   - Понятно, что от чего зависит
   - Легко отследить поток данных

2. **Надёжность**
   - Автоматическая обработка ошибок
   - Гарантированная последовательность операций
   - Встроенный мониторинг

3. **Продуктивность**
   - Меньше боилерплейта
   - Чистый и понятный код
   - Легче поддерживать

### 🎁 Бонусы:

1. **Встроенная документация**
   - События описывают бизнес-процессы
   - Код сам рассказывает свою историю

2. **Тестируемость**
   - Легко мокать события
   - Чёткие точки для тестирования
   - Предсказуемое поведение

3. **Масштабируемость**
   - От маленьких скриптов до больших приложений
   - Легко добавлять новую функциональность
   - Не ломает существующий код

### 🎯 Идеально подходит для:

- Чат-ботов
- API-сервисов
- Микросервисов
- Систем реального времени
- Любых асинхронных приложений

### 📈 ROI:

- Сокращение времени разработки на 30-40%
- Уменьшение количества багов
- Упрощение поддержки кода
- Ускорение onboarding новых разработчиков

**Это как Typescript для архитектуры приложения - делает неявное явным и помогает избежать ошибок на этапе разработки.**




# katch – static event-oriented application glue


```
import {Katch} from 'katch';

@Katch
class cat {
  static event() {
    cat.event.bited     = Katch.event();
    cat.event.murred    = Katch.event();
  }
  static request() {
    cat.request.food    = Katch.request();
  }

  @Katch
  make_mur() {
    katch(human.event.touchedCat, {Human: this.Owner});
    console.log('Cat: mur');
    
  }
  
  @Katch
  make_bite() {
    let [, {Human}] = katch(human.event.touchedCat, {Human: $ => $ !== this.Owner }, );
    console.log('Cat bite', Human);
  }

  @Katch
  murring(process) {
    this.make_mur();
    
  }
  
}

@Katch
class human {
  
  @Katch
  pet() {
    katch(cat.event.murred);
    console.log('Human: *pet cat');
  }
  
  @Katch
  test_in_context() {
    katch(apartment.cat.)
  }
  
}


export {cat, human};
```

run it using shell command:

```
node -r ts-node/register/transpile-only --nolazy --inspect katch.ts --init-context=cat,human,scene
```
