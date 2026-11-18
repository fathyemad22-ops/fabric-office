 
 # Filterable Product List 🛍️
 ![React](https://img.shields.io/badge/React-v18.3.1-blue)
![Status](https://img.shields.io/badge/status-Completed-brightgreen)

 >This project is part of the **React & Next.js Training**
 conducted by [Gaza Sky Geeks](https://gazaskygeeks.com/).
 The challenge evaluates front-end development skills by building a **Filterable Product List**. 

 The project has two phases:
 1. **Phase 1**: HTML, CSS, and JavaScript implementation.
 2. **Phase 2**: React.js conversion applying concepts from the Mosh Hamedani React tutorial.
 ### [Live Demo Here](https://m-7assann.github.io/filterable-product-list/Phase1/) 

 ---

   ## Table of Contents 
   - [Features](#features) 
   - [Phase 1: HTML, CSS & JavaScript Implementation](#phase-1-html-css--javascript-implementation)
   - [Requirements](#requirements)
   - [HTML Structure](#html-structure)   
   - [CSS Styling](#css-styling)   
   - [JavaScript Functionality](#javascript-functionality) 
   - [Phase 2: React Conversion](#phase-2-react-conversion)   
   - [Component Structure](#component-structure)   
   - [State Management](#state-management)   
   - [Acknowledgments](#acknowledgments)  
   
   ---  
   
   ## Features 
   - Filterable product list based on categories. 
   - Dynamic rendering of products with JavaScript and React.js. 
   - Clean and responsive design using CSS FlexBox. 
   - Easy to understand project structure.  
   
---

# Phase 1: HTML, CSS & JavaScript Implementation
### Requirements 
- **HTML Structure**:   
   - A clear heading to identify the product list.   
   - A filter section to select categories.   
   - A product display area to list products dynamically.
- **CSS Styling**:   
   - Responsive and visually appealing layout using **flexbox**.   
   - Readable typography and interactive elements like filter buttons.    
- **JavaScript Functionality**:   
   - Product data defined as an array of objects.   
   - Dynamic creation of product listings based on the product array.   
   - Filter functionality by category and an "All" option to show all products.  

## HTML Structure 
```html 
<div class="container">
    <h1>Product List</h1>

    <!-- Filter Section -->
    <div class="filter-section">
        <button onclick="filterProducts('All')" class="filter-btn active">All</button>
        <button onclick="filterProducts('Electronics')" class="filter-btn">Electronics</button>
        <button onclick="filterProducts('Clothing')" class="filter-btn">Clothing</button>
    </div>
    <div id="product-list" class="product-list">
    </div>
</div> 
```


## CSS Styling

I demonstrated various styling techniques to create a structured, responsive, and visually interactive layout.

### 1. **Global Styling (Body)**
   - `font-family: "Poppins", sans-serif`: Ensures consistent typography across the entire site.
   - `background: linear-gradient(#12053b, #58003c)`: Uses a gradient background for visual appeal.
   - `min-height: 100vh`: Ensures the body always covers at least the full height of the viewport.

### 2. **Container Layout**
   - `.container { max-width: 1200px; margin: 0 auto; }`: Centers the main content and limits its width, creating a well-structured layout with auto horizontal margins for centering.

### 3. **Typography**
   - `h1 { text-align: center; font-size: 2.5em; color: whitesmoke; }`: Large, centered heading with clear color contrast against the dark background.
   - `.product-item h3`: Styled with a lighter gray color `rgb(192, 192, 192)` and enlarged for prominence, changing to a darker blue on hover.

### 4. **Button Styling and Interaction**
   - `.filter-btn`: Styled with a vibrant color scheme, rounded corners, and padding for a modern button look.
   - `transition: background-color 0.3s, transform 0.2s`: Adds smooth hover animations where the button changes color and scales slightly when hovered over.
   - `.filter-btn.active`: Uses green (`#28a745`) to indicate active state with additional shadow effects for emphasis.

### 5. **Flexbox for Layout**
   - `.product-list { display: flex; flex-wrap: wrap; justify-content: center; }`: Flexbox is used to align the product items in a responsive grid. `gap: 20px` spaces the items evenly.

### 6. **Card (Product) Styling**
   - `.product-item { background-color: rgba(0, 4, 54, 0.3); border-radius: 12px; transition: transform 0.3s, box-shadow 0.3s; }`: Creates card-like containers for each product with a slightly transparent background, rounded corners, and smooth hover animations.
   - `.product-item:hover`: When hovered, the cards slightly elevate (`transform: translateY(-10px)`) and the background color lightens.

### 7. **Responsive Design**
   - `@media (max-width: 768px)`: Defines a media query that adjusts the `.product-item` to take up 100% width on smaller screens for better mobile responsiveness.

## JavaScript Functionality 

I implemented product filtering functionality using DOM manipulation and event handling.

### 1. **Product Data**
   - `products`: This is an array of objects containing product information such as name, category, and price. It acts as the data source for displaying and filtering products.
   - **Product Data Example**: 
```javascript
const products = [
    { name: 'Laptop', category: 'Electronics', price: 999 },
    { name: 'Smartphone', category: 'Electronics', price: 699 },
    { name: 'T-shirt', category: 'Clothing', price: 19 },
    { name: 'Jeans', category: 'Clothing', price: 49 },
    { name: 'Headphones', category: 'Electronics', price: 199 },
    { name: 'Jacket', category: 'Clothing', price: 89 }
];
```

### 2. **Display Products Function**
   - **`displayProducts(productArray)`**: This function takes an array of products (`productArray`) and displays them dynamically on the page.
     - `const productList = document.getElementById('product-list');`: Selects the container where product items will be displayed.
     - `productList.innerHTML = '';`: Clears any existing content in the product list to avoid duplicates when new products are added.
     - `productArray.forEach(product => { ... });`: Loops through each product in the array and creates a new `div` element with the class `product-item` for each product.
     - `productItem.innerHTML = `\``<h3>${product.name}</h3> ... `\``;`: Inserts product details (name, category, price) into the `div` using template literals.
     

     
     - `productList.appendChild(productItem);`: Adds each product item to the product list on the page.

```javascript
function displayProducts(productArray) {
    const productList = document.getElementById('product-list'); // Select the product list container
    productList.innerHTML = ''; // Clear existing products

    productArray.forEach(product => { // Loop through the product array
        const productItem = document.createElement('div'); // Create a div for each product
        productItem.classList.add('product-item'); // Add class to style the product div

        productItem.innerHTML = `
            <h3>${product.name}</h3>  // Insert product name
            <p>Category: ${product.category}</p>  // Insert product category
            <p>Price: $${product.price}</p>  // Insert product price
        `;

        productList.appendChild(productItem); // Add the product div to the product list
    });
}
```
### 3. **Filter Products Function**
   - **`filterProducts(category)`**: This function filters the displayed products based on their category.
     - **Button State Management**:
       - `const buttons = document.querySelectorAll('.filter-btn');`: Selects all filter buttons.
       - `buttons.forEach(button => button.classList.remove('active'));`: Removes the `active` class from all buttons to reset the visual state.
       - `document.querySelector(...).classList.add('active');`: Adds the `active` class to the button that was clicked, highlighting the active filter.
     - **Filtering Logic**:
       - `if (category === 'All')`: If 'All' is selected, it displays all products.
       - `const filteredProducts = products.filter(product => product.category === category);`: Filters the `products` array by matching the selected category and passes the filtered array to `displayProducts(filteredProducts)`.
```javascript
function filterProducts(category) {
    // Select all filter buttons using the 'filter-btn' class
    const buttons = document.querySelectorAll('.filter-btn');

    // Remove the 'active' class from all buttons to reset the active state
    buttons.forEach(button => button.classList.remove('active'));

    // Find the button that matches the category being clicked and add the 'active' class to highlight it
    // This ensures that only the selected button is visually marked as active
    document.querySelector(`button[onclick="filterProducts('${category}')"]`).classList.add('active'); 

    // If the category is 'All', display all products by calling displayProducts with the full product list
    if (category === 'All') {
        displayProducts(products); 
    } else {
        // Otherwise, filter the products array to only include those that match the selected category
        const filteredProducts = products.filter(product => product.category === category);
        
        // Call displayProducts to update the product list with the filtered products
        displayProducts(filteredProducts);
    }
}

```
### 4. **Initial Call**
   - `filterProducts('All');`: Initially calls `filterProducts` with `'All'`, ensuring all products are displayed by default when the page loads.

```javascript
filterProducts('All'); // Initially display all products
```

### Summary
- The **`displayProducts` function** dynamically generates and appends product items to the DOM.
- The **`filterProducts` function** manages category-based filtering and updates the visual state of filter buttons.
- **DOM Manipulation**, **Event Handling**, and **Array Filtering** are the core JavaScript techniques used in this code.

---

# Phase 2: React Conversion

In Phase 2 of the project, the initial HTML, CSS, and JavaScript implementation was converted into a React.js application. This process applied key React concepts such as components, state management, and props to make the app more modular, reusable, and scalable.

## Component Structure

The application was divided into separate, reusable components, which follow the principle of separation of concerns. Each component is responsible for a specific task, making the application easier to manage and scale. The major components created are:

### 1. **App Component**
The main entry point of the application. It holds the product data, manages the state of the currently selected category, and passes down necessary data and event handlers to child components.

```tsx
const App: React.FC = () => {
  const products: Product[] = [
    { name: "Laptop", category: "Electronics", price: 999 },
    { name: "Smartphone", category: "Electronics", price: 699 },
    { name: "T-shirt", category: "Clothing", price: 19 },
    { name: "Jeans", category: "Clothing", price: 49 },
    { name: "Headphones", category: "Electronics", price: 199 },
    { name: "Jacket", category: "Clothing", price: 89 },
  ];

  const [activeCategory, setActiveCategory] = useState<string>("All");

  const filterProducts = (category: string) => {
    setActiveCategory(category);
  };

  const filteredProducts: Product[] =
    activeCategory === "All"
      ? products
      : products.filter((product) => product.category === activeCategory);

  return (
    <div className="container">
      <h1>Product List</h1>
      <FilterSection
        activeCategory={activeCategory}
        onFilterChange={filterProducts}
      />
      <ProductList products={filteredProducts} />
    </div>
  );
};
```

### 2. **FilterSection Component**
This component renders the filter buttons. It takes the current category and the function to update the category as props. When a filter button is clicked, it calls the `setCategory` function passed from the `App` component to update the current category state.

```tsx
function FilterSection({ category, setCategory }) {
    const categories = ['All', 'Electronics', 'Clothing'];

    return (
        <div className="filter-section">
            {categories.map(cat => (
                <button 
                    key={cat} 
                    className={`filter-btn ${cat === category ? 'active' : ''}`}
                    onClick={() => setCategory(cat)}
                >
                    {cat}
                </button>
            ))}
        </div>
    );
}
```

### 3. **ProductList Component**
This component is responsible for rendering the filtered list of products. It accepts the filtered products array as a prop and maps through it to create individual product items.

```tsx
const ProductList: React.FC<ProductListProps> = ({ products }) => {
  return (
    <div className="product-list">
      {products.map((product, index) => (
        <div key={index} className="product-item">
          <h3>{product.name}</h3>
          <p>Category: {product.category}</p>
          <p>Price: ${product.price}</p>
        </div>
      ))}
    </div>
  );
};
```

## State Management

State in React is managed using the `useState` hook, which is used here to track the selected product category. The state is initialized in the `App` component and passed down to child components via props. Child components can modify this state through event handling, allowing for dynamic updates and rendering of the product list based on the selected filter.

```tsx
const [category, setCategory] = useState<string>('All');
```

In this case:
- `category` holds the current filter category (default is `'All'`).
- `setCategory` is used to update the filter based on user input.


## Summary

- The app was converted from vanilla HTML, CSS, and JavaScript into a modular, React.js-based application.
- Components such as `FilterSection` and `ProductList` were created to separate functionality and enable reusability.
- State was managed using React’s `useState` hook, allowing dynamic product filtering and updates to the UI in response to user interaction.
- Event handling through props enabled seamless communication between parent and child components, ensuring a fluid user experience.

--- 

## Acknowledgments
Thanks to [Gaza Sky Geeks](https://gazaskygeeks.com/). for the training and opportunity to enhance my skills.

[<img src="https://gazaskygeeks.com/wp-content/uploads/2024/09/06b18d8acdb6c1ea4e7ff305b70cb160.png" alt="MarineGEO circle logo" style="width:500px;"/>](https://gazaskygeeks.com/)


